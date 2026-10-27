import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { todayInTz } from "@/lib/services/attendance.service";
import { computeBalances, countWorkingDays, overlappingRequests } from "@/lib/services/leave.service";
import { llmCall } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/policy";
import { matchLeaveType } from "@/lib/ai/tools";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { writeAiLog } from "@/lib/ai/log";

/**
 * POST /api/ai/smart-leave — M8 "Smart leave" (F21: HR-own + employee,
 * admin —). Brief: "Need next Monday and Tuesday off for a wedding" →
 * JSON {type, start, end, reason} → pre-filled form. The user confirms.
 *
 * Guardrails: JSON output validated (zod + type-match against REAL leave
 * types); failure par EK retry, phir fallback: true (client normal form
 * kholega). Kabhi bhi data save NAHI hota yahan se — final apply hamesha
 * POST /api/leave ke rules se hota hai.
 */

const bodySchema = z.object({
  text: z.string().trim().min(4, "Please type your leave request").max(500),
});

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function extractJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

export const POST = apiHandler(async (request) => {
  const started = Date.now();
  const body = bodySchema.parse(await request.json());
  const { supabase, profile } = await requireAuth();

  // F21 access: HR (own) + Employee (own) — Admin explicit no
  if (profile.role === "admin") {
    throw new ApiError(403, "Smart leave employee/HR logins ke liye hai — admin isko use nahi karta.");
  }
  if (!profile.employee_id) {
    throw new ApiError(422, "Your login is not linked to an employee record.");
  }

  const rl = checkAiRateLimit(profile.id);
  if (!rl.allowed) {
    throw new ApiError(
      429,
      `AI limit reached (20 requests/hour) — ${Math.ceil(rl.retryAfterSec / 60)} min baad try karein.`
    );
  }

  // ---- Context: types, settings, holidays, balances, overlaps ----
  const year = new Date().getFullYear();
  const [settingsRes, typeRes, holRes, myReqRes] = await Promise.all([
    supabase
      .from("hcm_company_settings")
      .select("company_name, timezone, weekend_days")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("hcm_leave_types").select("id, code, name, yearly_quota, is_paid").order("code"),
    supabase.from("hcm_holidays").select("date").gte("date", `${year}-01-01`).lte("date", `${year}-12-31`),
    supabase
      .from("hcm_leave_requests")
      .select("id, start_date, end_date, days, status")
      .eq("employee_id", profile.employee_id)
      .in("status", ["pending", "approved"])
      .gte("start_date", `${year}-01-01`),
  ]);
  if (typeRes.error || settingsRes.error) throw new ApiError(500, typeRes.error?.message ?? settingsRes.error?.message);

  const tz = settingsRes.data?.timezone ?? "Asia/Karachi";
  const today = todayInTz(tz);
  const types = typeRes.data ?? [];
  if (!types.length) throw new ApiError(422, "No leave types configured yet — admin setup complete karein.");
  const holidaySet = new Set((holRes.data ?? []).map((h) => h.date));
  const weekendDays = settingsRes.data?.weekend_days ?? [0, 6];
  const balances = computeBalances(types, myReqRes.data ?? [], year);

  // ---- LLM extraction (1 retry — brief guardrail) ----
  const system = buildSystemPrompt({
    role: profile.role,
    fullName: profile.full_name,
    companyName: settingsRes.data?.company_name ?? "your company",
    tz,
    today,
    leaveTypes: types,
    toolSection: "",
  });

  const typeList = types
    .map((t) => `${t.code} (${t.name}${t.yearly_quota != null ? `, quota ${t.yearly_quota}/year` : ", unlimited"})`)
    .join("; ");

  const prompt = [
    `Convert this leave request into JSON. Today is ${today} (YYYY-MM-DD, timezone ${tz}).`,
    `Available leave type codes: ${typeList}.`,
    "Pick the most fitting type_code (casual for weddings/family/personal, sick for illness, annual for vacation, unpaid only if clearly stated).",
    "Resolve relative dates ('next Monday', 'kal', 'parso') into absolute YYYY-MM-DD using today. If an end date is implied ('Monday and Tuesday'), set end to the last mentioned day.",
    'Reply with ONLY this JSON (no markdown, no extra text): {"type_code":"...","start":"YYYY-MM-DD","end":"YYYY-MM-DD","reason":"short reason"}',
    "If the request is unclear or not a leave request, reply with ONLY: {\"cannot\":\"reason\"}",
    "",
    `Leave request: "${body.text}"`,
  ].join("\n");

  let draft = null;
  let provider = null;
  let lastRaw = "";

  for (let attempt = 0; attempt < 2 && !draft; attempt += 1) {
    try {
      const res = await llmCall({ system, messages: [{ role: "user", content: prompt }], temperature: 0.1 });
      provider = res.provider;
      lastRaw = res.text;
      const json = extractJson(res.text);
      if (!json || json.cannot) break; // unclear → fallback (normal form)
      if (!dateRe.test(String(json.start ?? "")) || !dateRe.test(String(json.end ?? ""))) continue; // retry once
      const leaveType = matchLeaveType(body.text, types, json.type_code);
      if (!leaveType) continue; // retry once
      let start = json.start;
      let end = json.end;
      if (end < start) [start, end] = [end, start];
      if (start < today) continue; // past — retry; phir bhi fail → form
      draft = {
        leaveTypeId: leaveType.id,
        typeCode: leaveType.code,
        typeName: leaveType.name,
        paid: Boolean(leaveType.is_paid),
        startDate: start,
        endDate: end,
        reason: String(json.reason ?? body.text).slice(0, 500),
      };
    } catch (err) {
      console.error("[AI] smart-leave attempt failed:", err?.message);
    }
  }

  if (!draft) {
    await writeAiLog({
      supabase,
      profile,
      kind: "smart_leave",
      prompt: body.text,
      toolCalls: { provider, attempts: 2 },
      response: "fallback_to_form",
      latencyMs: Date.now() - started,
      status: "error",
    });
    return NextResponse.json({
      ok: true,
      data: {
        draft: null,
        fallback: true,
        message: "AI request parse nahi kar saka — normal form use karein.",
      },
    });
  }

  // ---- Server-side preview validation (form phir bhi /api/leave se guzregi) ----
  const days = countWorkingDays(draft.startDate, draft.endDate, weekendDays, holidaySet);
  const balance = balances.find((b) => b.typeId === draft.leaveTypeId) ?? null;
  const warnings = [];
  if (days <= 0) warnings.push("Is range me koi working day nahi (sirf weekend/holiday).");
  if (balance?.remaining != null && days > balance.remaining) {
    warnings.push(`${draft.typeName} balance kam hai — ${balance.remaining} remaining, ${days} requested.`);
  }
  const clashes = overlappingRequests(myReqRes.data ?? [], draft.startDate, draft.endDate);
  if (clashes.length) {
    warnings.push(`Dates already ${clashes[0].status} request (${clashes[0].start_date} → ${clashes[0].end_date}) se overlap karti hain.`);
  }

  await writeAiLog({
    supabase,
    profile,
    kind: "smart_leave",
    prompt: body.text,
    toolCalls: { provider, attempts: 1 },
    response: JSON.stringify(draft),
    latencyMs: Date.now() - started,
    status: "ok",
  });

  return NextResponse.json({
    ok: true,
    data: {
      draft: { ...draft, workingDays: days },
      balance: balance ? { remaining: balance.remaining, quota: balance.quota } : null,
      warnings,
      label: "AI-generated",
      remaining: rl.remaining,
    },
  });
});
