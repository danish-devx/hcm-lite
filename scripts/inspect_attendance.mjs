// Inspect attendance-related tables + settings columns from live Supabase
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envFile = readFileSync("/home/z/my-project/.env.local", "utf8");
const getEnv = (k) => envFile.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const db = createClient(url, key);

const TABLES = ["hcm_attendance", "hcm_attendance_corrections", "hcm_company_settings", "hcm_employees", "hcm_profiles"];

for (const t of TABLES) {
  const { data, error } = await db.from(t).select("*").limit(1);
  if (error) { console.log(`== ${t} == ERROR: ${error.message}`); continue; }
  const cols = data && data[0] ? Object.keys(data[0]) : [];
  console.log(`\n== ${t} == rows:${data ? "some" : "empty"} cols:${cols.length ? "" : "?"}`);
  console.log(cols.join(", "));
  if (t === "hcm_company_settings" && data?.[0]) {
    console.log("SETTINGS ROW:", JSON.stringify(data[0], null, 2));
  }
}

// sample employees for context
const { data: emps } = await db.from("hcm_employees").select("id, employee_code, full_name, email, department_id, status").limit(10);
console.log("\n== employees ==", JSON.stringify(emps, null, 1));
