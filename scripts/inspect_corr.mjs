import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
const res = await fetch(`${url}/rest/v1/?apikey=${key}`, { headers: { Authorization: `Bearer ${key}` } });
const spec = await res.json();
console.log("ALL TABLES:", Object.keys(spec.definitions).join(", "));
for (const name of ["hcm_attendance_corrections"]) {
  const def = spec.definitions?.[name];
  if (!def) { console.log(`== ${name} == NOT EXPOSED`); continue; }
  console.log(`\n== ${name} == required: ${JSON.stringify(def.required ?? [])}`);
  for (const [col, props] of Object.entries(def.properties)) console.log(`  ${col.padEnd(20)} ${props.format ?? props.type}${props.description ? "  // " + props.description.slice(0, 50) : ""}`);
}
// RPCs
const rpcs = Object.keys(spec.paths || {}).filter(p => !p.startsWith("/")).concat(Object.keys(spec.definitions).filter(k => /proc/.test(k)));
console.log("\nPATHS w/ rpc:", Object.keys(spec.paths).filter(p => p.includes("rpc")).slice(0, 20));
