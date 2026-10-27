import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { todayInTz } from "@/lib/services/attendance.service";
import { llmCall, toolsPrompt, extractJsonObject } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/policy";
import { AI_TOOLS, runAiTool } from "@/lib/ai/tools";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { writeAiLog } from "@/lib/ai/log";

/**
 * POST /api/ai/chat — M8 "Ask the assistant" (F19, all roles).
 *
 * Flow (brief): model picks a tool → backend runs it with the user's scope →
 * model writes the answer. Tool results user ke role-scope me hain (tools.js).
 * Guardrails: 15s per LLM call, max 5 rounds, 20 req/user/hour, ai_logs entry,
 * provider fail → friendly fallback message.
 */

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      })
    )
    .min(1)
    .max(24),
});

const FALLBACK_TEXT =
  "AI assistant abhi thora busy hai — kuch dair baad dobara try karein. / The AI assistant is temporarily unavailable, please try again in a moment.";

const MAX_ROUNDS = 5;

export const POST = apiHandler(async (request) => {
  const started = Date.now();
  const body = bodySchema.parse(await request.json());
  const { supabase, profile, employee } = await requireAuth();

  // ---- Rate limit (20/hour/user, sab AI routes shared) ----
  const rl = checkAiRateLimit(profile.id);
  if (!rl.allowed) {
    throw new ApiError(
      429,
      `AI limit reached (20 requests/hour) — ${Math.ceil(rl.retryAfterSec / 60)} min baad try karein.`
    );
  }

  // ---- Context + system prompt ----
  const [settingsRes, typeRes] = await Promise.all([
    supabase
      .from("hcm_company_settings")
      .select("company_name, timezone, weekend_days, office_start, grace_minutes")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("hcm_leave_types").select("id, code, name, yearly_quota"),
  ]);
  if (settingsRes.error || typeRes.error) throw new ApiError(500, settingsRes.error?.message ?? typeRes.error?.message);

  const tz = settingsRes.data?.timezone ?? "Asia/Karachi";
  const today = todayInTz(tz);
  const companyName = settingsRes.data?.company_name ?? "your company";
  const system = buildSystemPrompt({
    role: profile.role,
    fullName: profile.full_name,
    companyName,
    tz,
    today,
    settings: settingsRes.data ?? {},
    leaveTypes: typeRes.data ?? [],
    toolSection: toolsPrompt(AI_TOOLS),
  });

  // ---- Tool loop ----
  const conversation = body.messages.map((m) => ({ ...m }));
  const trace = [];
  let provider = null;
  let reply = null;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    let text;
    try {
      const res = await llmCall({ system, messages: conversation });
      text = res.text;
      provider = res.provider;
    } catch (err) {
      console.error("[AI] chat provider failure:", err?.message);
      await writeAiLog({
        supabase,
        profile,
        kind: "chat",
        prompt: body.messages.at(-1)?.content,
        toolCalls: { trace, provider },
        response: "provider_failure",
        latencyMs: Date.now() - started,
        status: "error",
      });
      return NextResponse.json({
        ok: true,
        data: { reply: FALLBACK_TEXT, toolTrace: trace, provider, label: "AI-generated" },
      });
    }

    const parsed = extractJsonObject(text);
    const toolName = parsed && typeof parsed.tool === "string" ? parsed.tool : null;

    if (!toolName) {
      reply = text;
      break;
    }

    // ---- Model ne tool chuna — scoped run ----
    const result = await runAiTool(toolName, parsed.args ?? null, {
      supabase,
      profile,
      employee,
      tz,
      today,
      weekendDays: settingsRes.data?.weekend_days ?? [0, 6],
    });
    trace.push({ tool: toolName, args: parsed.args ?? {}, ms: result?._ms ?? null });

    conversation.push({ role: "assistant", content: text });
    conversation.push({
      role: "user",
      content: JSON.stringify({ toolResult: result }),
    });
  }

  if (reply == null) {
    // rounds exhausted — tool results ke saath ek final answer ki koshish
    reply =
      "Mujhe is sawal ke liye zaroori data mil gaya lekin poora jawab tayyar nahi ho saka. Thora specific sawal try karein (e.g. 'how many active employees are in Engineering?').";
  }

  await writeAiLog({
    supabase,
    profile,
    kind: "chat",
    prompt: body.messages.at(-1)?.content,
    toolCalls: { trace, provider },
    response: reply,
    latencyMs: Date.now() - started,
    status: "ok",
  });

  return NextResponse.json({
    ok: true,
    data: {
      reply,
      toolTrace: trace,
      provider,
      label: "AI-generated",
      remaining: rl.remaining,
    },
  });
});
