import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await admin.from("hcm_audit_logs").select("action, created_at").order("created_at", { ascending: false }).limit(30);
data.forEach((r, i) => console.log(`${i + 1}\t${r.created_at.slice(0, 19)}\t${r.action}`));
console.log("total leave.approved check:", data.filter((r) => r.action === "leave.approved").length, "in top 30");
