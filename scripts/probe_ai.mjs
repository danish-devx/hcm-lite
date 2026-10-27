/**
 * Phase 8 quick probe — ek admin chat call (tool loop verify).
 */
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return cookie;
}

const cookie = await login("admin.demo@example.com", "Test@1234");
console.log("login:", cookie ? "OK" : "FAIL");

const t0 = Date.now();
const res = await fetch(`${BASE}/api/ai/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({
    messages: [{ role: "user", content: "How many active employees are in Engineering?" }],
  }),
  signal: AbortSignal.timeout(60000),
});
console.log("status:", res.status, "in", Date.now() - t0, "ms");
const j = await res.json();
console.log(JSON.stringify(j, null, 2).slice(0, 1500));
