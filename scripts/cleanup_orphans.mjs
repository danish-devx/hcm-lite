/**
 * Phase 3 verify ke dauran failed attempts ke orphan rows clean karo.
 * (Purana bug: profile insert trigger conflict → rollback ne employee+profile chhod diye the.)
 * Run: node scripts/cleanup_orphans.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const admin = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const ORPHAN_EMAILS = ["ayesha.khan@bloom.test", "test.person@bloom.test"];

// Profiles jinki auth user exist nahi karti (orphans)
const { data: profiles } = await admin.from("hcm_profiles").select("id, email");
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const authIds = new Set((users?.users ?? []).map((u) => u.id));

const orphanProfiles = (profiles ?? []).filter((p) => !authIds.has(p.id));
console.log("orphan profiles:", orphanProfiles.map((p) => p.email));

for (const p of orphanProfiles) {
  const { error } = await admin.from("hcm_profiles").delete().eq("id", p.id);
  console.log(`delete profile ${p.email}:`, error ? error.message : "OK");
}

// Employees jininka auth user exist nahi karta (user_id null hai ya orphan)
const { data: employees } = await admin.from("hcm_employees").select("id, email, user_id");
const orphanEmployees = (employees ?? []).filter((e) => !e.user_id || !authIds.has(e.user_id));
console.log("orphan employees:", orphanEmployees.map((e) => e.email));

for (const e of orphanEmployees) {
  const { error } = await admin.from("hcm_employees").delete().eq("id", e.id);
  console.log(`delete employee ${e.email}:`, error ? error.message : "OK");
}

console.log("cleanup done.");
