/**
 * AI provider layer (Phase 8 — M8) — brief Section 4 guardrails:
 *  - "API key only in a backend env variable (AI_API_KEY); the browser never
 *    calls the AI provider." — ye file SIRF server-side routes se load hoti hai.
 *  - 15 s timeout per LLM call; provider fail → graceful fallback (route sambhalta hai).
 *
 * Providers:
 *  1. Gemini (REST) — GEMINI_API_KEY + GEMINI_MODEL env se. Endpoint
 *     GEMINI_BASE_URL env se bhi override ho sakta hai (default:
 *     https://generativelanguage.googleapis.com/v1beta — official Gemini API).
 *  2. z-ai-web-dev-sdk chat completions — fallback jo hosted-restricted hosts par
 *     bhi chalta hai (ye sandbox/dev ka default bana hua hai).
 *
 * Env vars (Vercel + local .env dono par same):
 *  - AI_PROVIDER     : auto | gemini | zai   (auto = gemini key ho to gemini, fail par zai)
 *  - GEMINI_API_KEY  : Google AI Studio se (https://aistudio.google.com/apikey)
 *  - GEMINI_MODEL    : e.g. gemini-3.5-flash-lite | gemini-3.8-flash
 *  - GEMINI_BASE_URL : optional — official URL ya koi OpenAI-compatible Gemini proxy
 *
 * NOTE (Vercel): env vars add/change karne ke baad REDEPLOY zaroori hai —
 * chal rahi serverless function ko naye vars tabhi milte hain.
 *
 * Tool protocol (dono providers ke liye SAME, provider-agnostic):
 *  System prompt me tools ke JSON schemas + instruction jata hai: data chahiye to
 *  SIRF {"tool":"name","args":{...}} reply karo; toolResult milne ke baad final
 *  answer likho. Ye "model picks a tool → backend runs it with the user's scope →
 *  model writes the answer" flow — brief ka exact requirement — har provider par
 *  ek hi tested code path se chalta hai.
 */

const DEFAULT_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const LLM_TIMEOUT_MS = 15_000;

/**
 * Env value normalize — wrapping quotes/spaces strip. Vercel dashboard me
 * GEMINI_MODEL="gemini..." (quotes ke sath) paste karna common ghalti hai jo
 * URL ko corrupt kar deti hai — ye defense us ko khatam karta hai.
 */
function cleanEnv(v) {
  const s = String(v ?? "").trim();
  if (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function providerPref() {
  return cleanEnv(process.env.AI_PROVIDER) || "auto";
}

export function geminiKey() {
  return cleanEnv(process.env.GEMINI_API_KEY);
}

export function geminiModel() {
  return cleanEnv(process.env.GEMINI_MODEL) || "gemini-3.5-flash-lite";
}

/**
 * Gemini API base URL — GEMINI_BASE_URL env se override ho sakta hai.
 * Defensive: trailing slash / poora models URL paste kar diya ho to bhi theek.
 */
export function geminiBase() {
  let base = cleanEnv(process.env.GEMINI_BASE_URL) || DEFAULT_GEMINI_BASE;
  base = base.replace(/\/+$/, "");
  base = base.replace(/\/models$/, "");
  return base;
}

/**
 * Diagnostics snapshot — /api/ai/health route ke liye. Koi secret full form
 * me return NAHI hota (key sirf preview).
 */
export function aiConfigSnapshot() {
  const key = geminiKey();
  const pref = providerPref();
  const order =
    pref === "zai"
      ? ["zai"]
      : pref === "gemini"
        ? key
          ? ["gemini"]
          : ["zai"]
        : key
          ? ["gemini", "zai"]
          : ["zai"];
  return {
    aiProviderPref: pref,
    providerOrder: order,
    hasGeminiKey: Boolean(key),
    geminiKeyPreview: key ? `${key.slice(0, 6)}…${key.slice(-4)}` : null,
    geminiModel: geminiModel(),
    geminiBaseUrl: geminiBase(),
  };
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
    const url = `${geminiBase()}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
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
      let detail = bodyText.slice(0, 200);
      try {
        const j = JSON.parse(bodyText);
        if (j?.error?.message) detail = j.error.message;
      } catch {
        /* raw text hi theek hai */
      }
      let msg = `gemini ${res.status}: ${detail}`;
      if (res.status === 404) {
        msg += ` — model "${model}" is project ke liye nahi mila; GEMINI_MODEL check karein (valid list /api/ai/health se)`;
      } else if (res.status === 400 && /api.?key/i.test(detail)) {
        msg += " — GEMINI_API_KEY invalid/expired hai";
      } else if (res.status === 403) {
        msg += " — key restricted hai ya region blocked hai (API key restrictions check karein)";
      }
      throw new Error(msg);
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

/**
 * Gemini Models API — is API key ke project me kaun se models available hain
 * (generateContent-supported). Health endpoint diagnostics ke liye.
 */
export async function listGeminiModels() {
  const key = geminiKey();
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const res = await fetch(`${geminiBase()}/models?pageSize=100&key=${encodeURIComponent(key)}`, {
    method: "GET",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    let detail = bodyText.slice(0, 160);
    try {
      detail = JSON.parse(bodyText)?.error?.message ?? detail;
    } catch {
      /* keep raw */
    }
    throw new Error(`gemini models list ${res.status}: ${detail}`);
  }
  const json = await res.json();
  return (json?.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => String(m.name ?? "").replace(/^models\//, ""));
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