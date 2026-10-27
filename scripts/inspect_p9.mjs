import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// tables of interest
for (const t of ["hcm_announcements", "hcm_notifications", "hcm_audit_logs", "hcm_leave_requests", "hcm_payroll_runs", "hcm_employees"]) {
  const { data, error } = await admin.from(t).select("*").limit(3);
  if (error) { console.log(`\n== ${t}: ERROR ${error.message}`); continue; }
  const cols = data[0] ? Object.keys(data[0]).join(", ") : "(empty)";
  console.log(`\n== ${t} cols:`, cols);
  console.log(JSON.stringify(data, null, 1).slice(0, 700));
}
// count audit rows
const { count } = await admin.from("hcm_audit_logs").select("*", { count: "exact", head: true });
console.log("\naudit_logs count:", count);
const { count: acount } = await admin.from("hcm_announcements").select("*", { count: "exact", head: true });
console.log("announcements count:", acount);
const { count: ncount } = await admin.from("hcm_notifications").select("*", { count: "exact", head: true });
console.log("notifications count:", ncount);
