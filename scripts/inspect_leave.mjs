/**
 * Inspect leave-related tables + RPCs for Phase 5.
 * Run: node scripts/inspect_leave.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const supabase = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

// 1. leave_requests columns via one insert-empty probe (use select with head)
const { error: lrErr } = await supabase.from("hcm_leave_requests").select("*").limit(1);
console.log("== hcm_leave_requests ==", lrErr ? `ERROR: ${lrErr.message}` : "OK");

// OpenAPI inspect for exact columns
const res = await fetch(`${get("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/`, {
  headers: { apikey: get("SUPABASE_SERVICE_ROLE_KEY"), Authorization: `Bearer ${get("SUPABASE_SERVICE_ROLE_KEY")}` },
});
const spec = await res.json();

for (const t of ["hcm_leave_requests", "hcm_leave_types", "hcm_holidays", "hcm_company_settings"]) {
  const def = spec.definitions?.[t];
  if (!def) { console.log(`\n== ${t} == NOT IN SCHEMA`); continue; }
  console.log(`\n== ${t} ==`);
  for (const [col, meta] of Object.entries(def.properties)) {
    console.log(`  ${col}: ${meta.format ?? meta.type}${def.required?.includes(col) ? " REQUIRED" : ""}${meta.description ? ` -- ${meta.description.slice(0, 80)}` : ""}`);
  }
}

// RPCs list
console.log("\n== RPCs (paths starting /rpc/) ==");
for (const p of Object.keys(spec.paths ?? {})) {
  if (p.startsWith("/rpc/")) console.log(" ", p);
}

// leave types rows
const { data: lts } = await supabase.from("hcm_leave_types").select("*").order("code");
console.log("\n== hcm_leave_types rows ==");
console.log(JSON.stringify(lts, null, 1));

// holidays rows
const { data: hol } = await supabase.from("hcm_holidays").select("*").order("date");
console.log("\n== hcm_holidays rows ==");
console.log(JSON.stringify(hol, null, 1));

// company settings
const { data: cs } = await supabase.from("hcm_company_settings").select("*").eq("id", 1).maybeSingle();
console.log("\n== hcm_company_settings ==");
console.log(JSON.stringify(cs, null, 1));
