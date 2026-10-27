import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const BASE = "http://localhost:3000";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const sbAdmin = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"));

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
async function api(cookie, path, body, method) {
  const res = await fetch(`${BASE}${path}`, { method: method ?? (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const emp = await login("employee.demo@example.com", "Test@1234");
const me = await api(emp, "/api/leave/me");
console.log("leave/me keys:", Object.keys(me.json?.data ?? {}));
console.log("types:", JSON.stringify((me.json?.data?.types ?? me.json?.data?.balances ?? []).slice(0, 4)));
const corr = await api(emp, "/api/attendance/corrections", { date: "2026-10-15", requested_check_in: "09:05", requested_check_out: "18:05", reason: "dbg test reason" });
console.log("correction:", corr.status, JSON.stringify(corr.json).slice(0, 300));
