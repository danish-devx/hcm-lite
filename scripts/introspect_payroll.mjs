// Introspect payroll-related tables in live Supabase (service role)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync("/home/z/my-project/.env.local", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url, key, { auth: { persistSession: false } });

const q = process.argv[2];
if (q === "cols") {
  const { data, error } = await sb.rpc("hcm_my_role"); // dummy call to test conn
  const res = await fetch(`${url}/rest/v1/rpc/`, { method: "HEAD" });
  // use information_schema via PostgREST openapi
  const r = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await r.json();
  const tables = ["hcm_payroll_runs", "hcm_payroll_items", "hcm_company_settings", "hcm_employees", "hcm_holidays", "hcm_leave_requests"];
  for (const t of tables) {
    const def = spec.definitions?.[t];
    if (!def) { console.log(`\n== ${t}: NOT FOUND`); continue; }
    console.log(`\n== ${t}`);
    for (const [col, p] of Object.entries(def.properties)) {
      console.log(`  ${col}: ${p.format}${p.default !== undefined ? ` default=${JSON.stringify(p.default)}` : ""}${p.description ? ` -- ${p.description}` : ""}`);
    }
  }
} else if (q === "data") {
  for (const t of ["hcm_payroll_runs", "hcm_payroll_items"]) {
    const { data, error } = await sb.from(t).select("*").limit(5);
    console.log(`\n== ${t}: ${error ? "ERR " + error.message : JSON.stringify(data, null, 1)}`);
  }
  const { data: emps } = await sb.from("hcm_employees").select("id, code, full_name, salary, basic_salary, status").limit(10);
  console.log(`\n== employees: ${JSON.stringify(emps, null, 1)}`);
  const { data: st } = await sb.from("hcm_company_settings").select("*").limit(1);
  console.log(`\n== settings: ${JSON.stringify(st, null, 1)}`);
}
