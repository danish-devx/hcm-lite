/**
 * AI call logging (Phase 8) — brief guardrail: "every call logged in ai_logs".
 * Table hcm_ai_logs: user_id, role, kind, prompt, tool_calls, response,
 * latency_ms, status. Fail-safe — logging fail hona answer ko fail nahi karta.
 */

export async function writeAiLog({ supabase, profile, kind, prompt, toolCalls, response, latencyMs, status }) {
  try {
    const { error } = await supabase.from("hcm_ai_logs").insert({
      user_id: profile.id,
      role: profile.role,
      kind,
      prompt: String(prompt ?? "").slice(0, 4000),
      tool_calls: toolCalls ?? null,
      response: String(response ?? "").slice(0, 6000),
      latency_ms: Math.round(latencyMs ?? 0),
      status,
    });
    if (error) console.error("[AI-LOG] insert failed:", error.message);
  } catch (err) {
    console.error("[AI-LOG] unexpected failure:", err?.message);
  }
}
