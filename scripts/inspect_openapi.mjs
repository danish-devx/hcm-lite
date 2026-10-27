/** Fetch PostgREST OpenAPI spec → print exact columns for Phase 2 tables. */
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");

const res = await fetch(`${url}/rest/v1/?apikey=${key}`, {
  headers: { Authorization: `Bearer ${key}` },
});
const spec = await res.json();

const WANT = [
  "hcm_attendance",
  "hcm_leave_requests",
  "hcm_employees",
  "hcm_profiles",
];

for (const name of WANT) {
  const def = spec.definitions?.[name];
  if (!def) {
    console.log(`\n== ${name} == NOT EXPOSED`);
    continue;
  }
  console.log(`\n== ${name} == (required: ${JSON.stringify(def.required ?? [])})`);
  for (const [col, props] of Object.entries(def.properties)) {
    console.log(
      `  ${col.padEnd(18)} ${props.format ?? props.type}${
        props.description ? `  // ${props.description.slice(0, 60)}` : ""
      }`
    );
  }
}
