/** Quick audit-trail check for leave actions. Run: node scripts/check_audit_leave.mjs */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const db = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const { data } = await db
  .from("hcm_audit_logs")
  .select("action, entity, created_at")
  .like("action", "leave.%")
  .order("created_at", { ascending: false })
  .limit(15);
for (const r of data ?? []) console.log(r.action, "|", r.entity, "|", r.created_at?.slice(0, 19));

const { count } = await db.from("hcm_leave_requests").select("*", { count: "exact", head: true });
console.log("leave_requests total:", count);
