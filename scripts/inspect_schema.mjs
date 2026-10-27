/**
 * Inspect live Supabase schema — exact column names for Phase 2 tables.
 * Run: node scripts/inspect_schema.mjs
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

const TABLES = [
  "hcm_profiles",
  "hcm_employees",
  "hcm_attendance",
  "hcm_leave_requests",
  "hcm_leave_balances",
  "hcm_announcements",
  "hcm_audit_logs",
];

for (const table of TABLES) {
  const { data, error } = await supabase.from(table).select("*").limit(3);
  if (error) {
    console.log(`\n== ${table} == ERROR: ${error.message}`);
    continue;
  }
  console.log(`\n== ${table} == rows: ${data.length}`);
  if (data.length) console.log(JSON.stringify(data, null, 1).slice(0, 1200));
}
