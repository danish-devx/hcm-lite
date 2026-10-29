import { NextResponse } from "next/server";

import { apiHandler, requireAuth } from "@/lib/guards";
import { aiConfigSnapshot, listGeminiModels, llmCall } from "@/lib/ai/provider";

/**
 * GET /api/ai/health — M8 AI diagnostics (sab logged-in roles accessible).
 *
 * "AI kaam nahi kar raha" ka live debugging tool:
 *  1. config  — kaun sa provider order hai, key set hai ya nahi (preview only),
 *               kaun sa model, kaun sa base URL.
 *  2. live    — ek chhota real LLM call ("OK" bolo) → exact latency/provider ya
 *               EXACT error message jo Vercel logs me bhi jata hai.
 *  3. models  — agar gemini fail hua aur key valid hai to Models API se is
 *               project ke available model names (copy-paste ready GEMINI_MODEL).
 *
 * NOTE: koi secret full form me return nahi hota. Rate-limit nahi lagta
 * (diagnostics tool hai), lekin auth zaroori hai.
 */

export const GET = apiHandler(async () => {
  await requireAuth();

  const config = aiConfigSnapshot();

  // ---- Live probe (llmCall = wahi code path jo chat/summarize use karta hai) ----
  const t0 = Date.now();
  const live = {
    ok: false,
    provider: null,
    latencyMs: null,
    sample: null,
    error: null,
  };
  try {
    const res = await llmCall({
      system: "You are an API health check. Reply with exactly one word: OK",
      messages: [{ role: "user", content: "ping" }],
    });
    live.ok = true;
    live.provider = res.provider;
    live.latencyMs = Date.now() - t0;
    live.sample = res.text.slice(0, 60);
  } catch (err) {
    live.ok = false;
    live.latencyMs = Date.now() - t0;
    live.error = String(err?.message ?? err).slice(0, 500);
    console.error("[AI] health probe failed:", live.error);
  }

  // ---- Actionable suggestions ----
  const suggestions = [];
  if (live.ok) {
    suggestions.push(
      `AI healthy hai (${live.provider} via ${config.geminiBaseUrl.includes("googleapis") ? "official Gemini API" : config.geminiBaseUrl}).`
    );
  } else {
    if (!config.hasGeminiKey) {
      suggestions.push(
        "GEMINI_API_KEY set nahi hai. Vercel → Settings → Environment Variables me add karein (Google AI Studio: https://aistudio.google.com/apikey se key banayein)."
      );
    } else if (config.providerOrder.includes("gemini")) {
      try {
        const models = await listGeminiModels();
        suggestions.push(
          `Gemini key SAHI hai (Models API chala) — problem model ya call me hai. Is project ke available models: ${models.slice(0, 14).join(", ")}${models.length > 14 ? " …" : ""}`
        );
      } catch (e) {
        suggestions.push(
          `Gemini key se Models API bhi fail: ${String(e?.message ?? e).slice(0, 220)} — key invalid/expired/restricted lagti hai.`
        );
      }
    }
    suggestions.push(
      "Vercel par env vars add/change karne ke baad REDEPLOY zaroori hai — purani deployment ko naye vars nahi milte. Deployments → latest → ⋯ → Redeploy."
    );
    suggestions.push(
      "GEMINI_MODEL value me quotes/spaces na hon — sirf jaise: gemini-3.5-flash-lite"
    );
  }

  return NextResponse.json({
    ok: true,
    data: { config, live, suggestions },
  });
});