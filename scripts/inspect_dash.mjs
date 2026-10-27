/**
 * Inspect data for Phase 7 dashboards — payroll items columns, audit rows,
 * attendance/leave volume per month.
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

// Payroll items sample
const { data: items } = await supabase.from("hcm_payroll_items").select("*").limit(2);
console.log("== hcm_payroll_items ==");
console.log(items ? Object.keys(items[0] ?? {}).join(", ") : "empty");

// Runs
const { data: runs } = await supabase
  .from("hcm_payroll_runs")
  .select("id, month, status")
  .order("month");
console.log("\n== hcm_payroll_runs ==");
console.log(runs?.map((r) => `${r.month}:${r.status}`).join("  "));

// Attendance volume by month
const { data: att } = await supabase
  .from("hcm_attendance")
  .select("date, status, worked_minutes")
  .order("date");
const byMonth = {};
for (const a of att ?? []) {
  const m = a.date?.slice(0, 7);
  byMonth[m] = (byMonth[m] ?? 0) + 1;
}
console.log("\n== attendance rows by month ==", JSON.stringify(byMonth));

// Leave requests
const { data: leaves } = await supabase
  .from("hcm_leave_requests")
  .select("id, status, days, start_date");
const lv = {};
for (const l of leaves ?? []) lv[`${l.start_date.slice(0, 7)}:${l.status}`] = (lv[`${l.start_date.slice(0, 7)}:${l.status}`] ?? 0) + 1;
console.log("== leave by month:status ==", JSON.stringify(lv));

// Audit log sample + count
const { count: auditCount } = await supabase
  .from("hcm_audit_logs")
  .select("id", { count: "exact", head: true });
const { data: auditRows } = await supabase
  .from("hcm_audit_logs")
  .select("action, entity, actor_role, created_at")
  .order("created_at", { ascending: false })
  .limit(5);
console.log("\n== audit count ==", auditCount);
console.log(auditRows?.map((a) => `${a.created_at?.slice(0, 16)} ${a.actor_role} ${a.action} ${a.entity}`).join("\n"));

// Employees full list
const { data: emps } = await supabase
  .from("hcm_employees")
  .select("code, full_name, gender, status, join_date, exit_date, basic_salary");
console.log("\n== employees ==");
console.log(emps?.map((e) => `${e.code} ${e.full_name} ${e.gender ?? "-"} ${e.status} join ${e.join_date} exit ${e.exit_date ?? "-"} ${e.basic_salary}`).join("\n"));
