import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: rows } = await admin.from("hcm_announcements").select("id, title, created_at").order("created_at");
console.log("before:", rows.length);
// keep newest per title, delete older duplicates
const seen = new Map();
const toDelete = [];
for (const r of rows ?? []) {
  if (seen.has(r.title)) toDelete.push(r.id);
  else seen.set(r.title, r);
}
if (toDelete.length) {
  const { error } = await admin.from("hcm_announcements").delete().in("id", toDelete);
  console.log("deleted:", toDelete.length, error?.message ?? "ok");
}
// also clean their fan-out notifications (same titles)
const { data: notifs } = await admin.from("hcm_notifications").select("id, title, created_at").ilike("title", "Announcement — %").order("created_at");
const nseen = new Map();
const ndel = [];
for (const n of notifs ?? []) {
  if (nseen.has(n.title)) ndel.push(n.id);
  else nseen.set(n.title, n);
}
if (ndel.length) {
  const { error } = await admin.from("hcm_notifications").delete().in("id", ndel);
  console.log("dup notifications deleted:", ndel.length, error?.message ?? "ok");
}
const { count } = await admin.from("hcm_announcements").select("*", { count: "exact", head: true });
console.log("after:", count);
