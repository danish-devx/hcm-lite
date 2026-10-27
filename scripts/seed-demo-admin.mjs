/**
 * Demo admin seed — testing/demo ke liye admin.demo@example.com
 * Run: node scripts/seed-demo-admin.mjs
 * (Profile trigger role=admin metadata se banati hai)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const admin = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

const EMAIL = "admin.demo@example.com";
const PASSWORD = "Test@1234";

const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const existing = list?.users?.find((u) => u.email === EMAIL);

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password: PASSWORD,
    user_metadata: { full_name: "Demo Admin", role: "admin" },
    ban_duration: "none",
  });
  if (error) throw error;
  console.log("admin.demo exists — password reset to Test@1234");
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Demo Admin", role: "admin" },
  });
  if (error) throw error;
  console.log("admin.demo created:", data.user.id);
}
