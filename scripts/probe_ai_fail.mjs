/**
 * Phase 8 failure probe — batao actual response kya aa raha hai.
 */
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

const employee = await login("employee.demo@example.com", "Test@1234");
const admin = await login("admin.demo@example.com", "Test@1234");

async function show(label, cookie, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const j = await res.json().catch(() => null);
  console.log(`\n== ${label} → ${res.status}`);
  console.log(JSON.stringify(j, null, 2)?.slice(0, 600));
}

await show("employee chat sick", employee, "/api/ai/chat", {
  messages: [{ role: "user", content: "How many sick leaves do I have left this year?" }],
});
await show("admin summarize", admin, "/api/ai/summarize", {
  dashboard: "admin",
  payload: { kpis: { headcount: 5 } },
  filters: { from: "2026-01-01", to: "2026-10-27" },
});
await show("employee smart leave", employee, "/api/ai/smart-leave", {
  text: "I need next Monday and Tuesday off for my sister's wedding",
});
