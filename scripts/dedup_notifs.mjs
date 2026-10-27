import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// dedup notifications per user+title (keep newest), keep unread flag if any dup was unread
const { data: rows } = await admin.from("hcm_notifications").select("id, user_id, title, is_read, created_at").order("created_at", { ascending: false });
const seen = new Map();
const del = [];
for (const r of rows ?? []) {
  const key = `${r.user_id}|${r.title}`;
  if (seen.has(key)) del.push(r.id);
  else seen.set(key, r);
}
console.log(`total=${rows.length}, duplicates=${del.length}`);
if (del.length) {
  const { error } = await admin.from("hcm_notifications").delete().in("id", del);
  console.log(error?.message ?? "deleted ok");
}
const { count } = await admin.from("hcm_notifications").select("*", { count: "exact", head: true });
console.log("remaining:", count);
