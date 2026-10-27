/**
 * AI rate limiter (Phase 8) — brief guardrail: "about 20 requests per user
 * per hour". In-memory sliding window (per server instance — hackathon scale
 * ke liye kaafi; multi-instance ho to Redis/cron table me move kar lena).
 */

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
// Brief: "about 20 requests per user per hour" — AI_RATE_MAX se override ho sakta hai.
const MAX_PER_WINDOW = Math.max(1, Number(process.env.AI_RATE_MAX ?? 20) || 20);

const hits = new Map(); // userId → [timestamps]

export function checkAiRateLimit(userId) {
  const now = Date.now();
  const list = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    const oldest = list[0];
    hits.set(userId, list);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
    };
  }
  list.push(now);
  hits.set(userId, list);
  // memory hygiene — khali buckets hata do
  if (hits.size > 500) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
    }
  }
  return { allowed: true, remaining: MAX_PER_WINDOW - list.length, retryAfterSec: 0 };
}
