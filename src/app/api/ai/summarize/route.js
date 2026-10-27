import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { todayInTz } from "@/lib/services/attendance.service";
import { llmCall } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/policy";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { writeAiLog } from "@/lib/ai/log";

/**
 * POST /api/ai/summarize — M8 "Dashboard summary" (F20, admin+hr only).
 *
 * Brief: "'Summarize' sends the KPI JSON for the current filters; returns
 * 3–5 insight bullets using only those numbers." Employee → 403.
 * KPI payload client ke M7 dashboard query se aata hai; server sirf LLM ko
 * strict "only these numbers" prompt deta hai — koi tool, koi DB query nahi.
 */

const bodySchema = z.object({
  dashboard: z.enum(["admin", "hr"]),
  payload: z.object({}).passthrough(), // KPI JSON — shape M7 route dekhta hai
  filters: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      department: z.string().nullable().optional(),
    })
    .optional(),
});

const MAX_PAYLOAD_CHARS = 12_000;

function trimPayload(payload) {
  // Trend arrays client par already slice hote hain; defensively yahan bhi.
  const out = { ...payload };
  for (const key of Object.keys(out)) {
    if (Array.isArray(out[key]) && out[key].length > 14) {
      out[key] = out[key].slice(0, 14);
    }
  }
  return out;
}

export const POST = apiHandler(async (request) => {
  const started = Date.now();
  const body = bodySchema.parse(await request.json());
  const { supabase, profile } = await requireAuth(["admin", "hr"]); // F20: employee —

  const rl = checkAiRateLimit(profile.id);
  if (!rl.allowed) {
    throw new ApiError(
      429,
      `AI limit reached (20 requests/hour) — ${Math.ceil(rl.retryAfterSec / 60)} min baad try karein.`
    );
  }

  const payload = trimPayload(body.payload ?? {});
  const payloadStr = JSON.stringify(payload, null, 1);
  if (payloadStr.length > MAX_PAYLOAD_CHARS) {
    throw new ApiError(422, "Dashboard payload too large — filters kam karke try karein.");
  }

  const [settingsRes] = await Promise.all([
    supabase
      .from("hcm_company_settings")
      .select("company_name, timezone")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  const tz = settingsRes.data?.timezone ?? "Asia/Karachi";
  const today = todayInTz(tz);

  const system = buildSystemPrompt({
    role: profile.role,
    fullName: profile.full_name,
    companyName: settingsRes.data?.company_name ?? "your company",
    tz,
    today,
    toolSection: "",
  });

  const rangeLine = body.filters?.from
    ? `Current filters: ${body.filters.from} → ${body.filters.to ?? today}${body.filters.department ? `, department ${body.filters.department}` : ""}.`
    : "Current filters: default.";

  const prompt = [
    `Summarize this ${body.dashboard} dashboard KPI data in 3-5 short insight bullets (• prefix).`,
    rangeLine,
    "STRICT: use ONLY the numbers in this JSON — no outside facts, no estimates. Mention the biggest movement, risks (absenteeism, pending approvals, high utilization) and one actionable suggestion.",
    "English ya Roman Urdu — chhota rakhen (har bullet ek line).",
    "",
    "KPI JSON:",
    payloadStr,
  ].join("\n");

  let summary;
  let provider = null;
  try {
    const res = await llmCall({ system, messages: [{ role: "user", content: prompt }], temperature: 0.3 });
    summary = res.text;
    provider = res.provider;
    // Sanity: khali/one-word reply ko fallback do
    if (!summary || summary.length < 12) throw new Error("summary too short");
  } catch (err) {
    console.error("[AI] summarize failure:", err?.message);
    await writeAiLog({
      supabase,
      profile,
      kind: "summary", // DB check constraint: hcm_ai_logs_kind_check me 'summary' allowed hai
      prompt: prompt.slice(0, 2000),
      toolCalls: { provider },
      response: "provider_failure",
      latencyMs: Date.now() - started,
      status: "error",
    });
    return NextResponse.json({
      ok: true,
      data: {
        summary: null,
        fallback:
          "AI summary abhi available nahi — dashboard numbers neeche live hain. Thori dair baad 'Summarize' dobara try karein.",
        provider,
        label: "AI-generated",
      },
    });
  }

  await writeAiLog({
    supabase,
    profile,
    kind: "summary",
    prompt: prompt.slice(0, 2000),
    toolCalls: { provider, dashboard: body.dashboard },
    response: summary,
    latencyMs: Date.now() - started,
    status: "ok",
  });

  return NextResponse.json({
    ok: true,
    data: { summary, provider, label: "AI-generated", remaining: rl.remaining },
  });
});
