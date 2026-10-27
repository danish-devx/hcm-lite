/**
 * Phase 10 — dump full live schema DDL (tables + columns + RLS + RPCs) from
 * Supabase information_schema via the OpenAPI endpoint, into a runnable
 * supabase/schema.sql skeleton for the repo (judges / fresh installs).
 *
 * NOTE: PostgREST OpenAPI gives columns/types/defaults but NOT full
 * constraints/triggers. This script writes a best-effort CREATE TABLE block
 * and appends pointers: hcm_supabase_phase0.sql holds RLS policies + RPCs +
 * seeds (run it after schema.sql).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(url, key, { auth: { persistSession: false } });

// PostgREST OpenAPI (service role) — tables + columns + descriptions
const res = await fetch(`${url}/rest/v1/?apikey=${encodeURIComponent(key)}`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const spec = await res.json();

const defs = spec?.definitions ?? spec?.components?.schemas ?? {};
const tables = Object.entries(defs)
  .filter(([name]) => name.startsWith("hcm_"))
  .sort(([a], [b]) => a.localeCompare(b));

const pgType = (fmt, desc) => {
  switch (fmt) {
    case "integer": return "integer";
    case "number": return "numeric";
    case "boolean": return "boolean";
    case "string":
      if ((desc ?? "").includes("date")) return "date";
      return "text";
    default: return "text";
  }
};

let out = `-- ============================================================
-- HCM Lite — Supabase schema (generated from live DB, Phase 10)
-- Fresh install:
--   1) Run this file in Supabase SQL editor (creates tables).
--   2) Run hcm_supabase_phase0.sql (RLS policies, RPCs, triggers note, seeds).
-- NOTE: DB triggers (e.g. "Finalized payroll run is locked", late rules)
-- were added manually in the dashboard — phase0 SQL contains their logic
-- comments. The hosted demo DB is already fully configured.
-- ============================================================\n\n`;

for (const [name, def] of tables) {
  const props = def.properties ?? {};
  const required = new Set(def.required ?? []);
  out += `create table if not exists public.${name} (\n`;
  const cols = Object.entries(props).map(([col, p]) => {
    const t = pgType(p.format, (p.description ?? "").toLowerCase());
    const nn = required.has(col) && !(p.default ?? null) ? " not null" : "";
    const dflt = p.default != null ? ` default ${p.default}` : "";
    return `  ${col} ${t}${nn}${dflt}`;
  });
  out += cols.join(",\n");
  out += `\n);\n\n`;
  // PK hint from description (PostgREST marks "Note: This is a Primary Key")
  const pkCols = Object.entries(props)
    .filter(([, p]) => (p.description ?? "").includes("Primary Key"))
    .map(([c]) => c);
  if (pkCols.length) out += `alter table public.${name} add primary key (${pkCols.join(", ")});\n\n`;
}

writeFileSync(new URL("../supabase/schema.sql", import.meta.url), out);
console.log(`Wrote supabase/schema.sql with ${tables.length} tables:`, tables.map(([n]) => n).join(", "));
