import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await admin.from("hcm_audit_logs").select("action").order("action");
const counts = {};
for (const r of data ?? []) counts[r.action] = (counts[r.action] ?? 0) + 1;
for (const [a, c] of Object.entries(counts)) console.log(`${c}\t${a}`);
