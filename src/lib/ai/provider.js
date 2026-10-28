/**
 * AI provider layer (Phase 8 — M8) — brief Section 4 guardrails:
 *  - "API key only in a backend env variable (AI_API_KEY); the browser never
 *    calls the AI provider." — ye file SIRF server-side routes se load hoti hai.
 *  - 15 s timeout per LLM call; provider fail → graceful fallback (route sambhalta hai).
 *
 * Providers:
 *  1. Gemini (generativelanguage.googleapis.com REST) — GEMINI_API_KEY jab host
 *     supported region me ho. Model GEMINI_MODEL env se (default gemini-2.5-flash).
 *  2. z-ai-web-dev-sdk chat completions — fallback jo hosted-restricted hosts par
 *     bhi chalta hai (ye sandbox/dev ka default bana hua hai).
 *
 * Tool protocol (dono providers ke liye SAME, provider-agnostic):
 *  System prompt me tools ke JSON schemas + instruction jata hai: data chahiye to
 *  SIRF {"tool":"name","args":{...}} reply karo; toolResult milne ke baad final
 *  answer likho. Ye "model picks a tool → backend runs it with the user's scope →
 *  model writes the answer" flow — brief ka exact requirement — har provider par
 *  ek hi tested code path se chalta hai.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const LLM_TIMEOUT_MS = 15_000;

function providerPref() {
  return (process.env.AI_PROVIDER ?? "auto").trim();
}

export function geminiKey() {
  return (process.env.GEMINI_API_KEY ?? "").trim();
}

export function geminiModel() {
 return (process.env.GEMINI_MODEL ?? "gemini-3.8-flash").trim();
}

/** Tool schemas → compact text form (system prompt ke liye). */
export function toolsPrompt(tools) {
  return tools
    .map((t) => {
      const props = Object.entries(t.parameters?.properties ?? {})
        .map(([k, v]) => `${k} (${v.type}${v.description ? `: ${v.description}` : ""})`)
        .join(", ");
      const req = (t.parameters?.required ?? []).join(", ");
      return `- ${t.name}: ${t.description}\n  args: {${props}}${req ? `\n  required: ${req}` : ""}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Gemini (REST, JSON tool protocol)
// ---------------------------------------------------------------------------

async function callGemini({ system, messages, temperature = 0.2 }) {
  const key = geminiKey();
  const model = geminiModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature, maxOutputTokens: 1024 },
      }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`gemini ${res.status}: ${bodyText.slice(0, 180)}`);
    }
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .join("")
      .trim();
    if (!text) throw new Error("gemini empty response");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// z-ai sdk (fallback — sandbox / restricted hosts)
// ---------------------------------------------------------------------------

let zaiPromise = null;

async function getZai() {
  if (!zaiPromise) {
    zaiPromise = import("z-ai-web-dev-sdk")
      .then((mod) => mod.default.create())
      .catch((err) => {
        zaiPromise = null;
        throw err;
      });
  }
  return zaiPromise;
}

async function callZai({ system, messages }) {
  const zai = await getZai();
  const work = zai.chat.completions.create({
    messages: [
      { role: "assistant", content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    thinking: { type: "disabled" },
  });
  // 15 s watchdog — brief guardrail
  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error("zai timeout")), LLM_TIMEOUT_MS)
  );
  const completion = await Promise.race([work, timeout]);
  const text = completion?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("zai empty response");
  return text;
}

// ---------------------------------------------------------------------------
// Unified entry — provider selection + one-level fallback
// ---------------------------------------------------------------------------

async function callOne(provider, args) {
  if (provider === "gemini") return callGemini(args);
  return callZai(args);
}

/**
 * Ek LLM turn chalao. Order: env AI_PROVIDER force ho to wahi warna gemini
 * (key ho to) → fail par zai. Har provider par transient errors (429/5xx/
 * network) ke liye ek chhota retry. Return { text, provider } ya throw.
 */
const RETRYABLE = /429|5\d\d|timeout|abort|network|fetch failed|ECONN/i;

export async function llmCall(args) {
  const pref = providerPref();
  const order =
    pref === "zai"
      ? ["zai"]
      : pref === "gemini"
        ? geminiKey()
          ? ["gemini"]
          : ["zai"]
        : geminiKey()
          ? ["gemini", "zai"]
          : ["zai"];

  let lastErr = null;
  for (const provider of order) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const text = await callOne(provider, args);
        return { text, provider };
      } catch (err) {
        lastErr = err;
        const msg = err?.message ?? String(err);
        console.error(`[AI] provider ${provider} attempt ${attempt + 1} failed:`, msg);
        if (attempt === 0 && RETRYABLE.test(msg)) {
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        break; // non-retryable (location block, bad key) → agla provider
      }
    }
  }
  throw lastErr ?? new Error("no AI provider available");
}

// ---------------------------------------------------------------------------
// Tool-call JSON extraction — model ke reply se {"tool":...} nikaalta hai
// ---------------------------------------------------------------------------

/** ```fences strip + pehla balanced {...} object nikaalo. */
export function extractJsonObject(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
