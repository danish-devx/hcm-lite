import { config } from "dotenv";
config({ path: ".env.local" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const res = await fetch(`${url}/rest/v1/?apikey=${key}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
const spec = await res.json();
for (const t of ["hcm_announcements", "hcm_notifications"]) {
  const def = spec.definitions?.[t];
  if (!def) { console.log(t, "NOT IN SPEC"); continue; }
  console.log(`\n== ${t} ==`);
  for (const [col, info] of Object.entries(def.properties)) {
    console.log(`  ${col}: ${info.format || info.type}${def.required?.includes(col) ? " REQUIRED" : ""} ${info.description ? "| " + info.description : ""}`);
  }
}
// also check RLS/policies via pg meta not available; check constraints on notifications
