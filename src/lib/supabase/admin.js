import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * SERVICE ROLE client — SIRF server-side privileged operations ke liye:
 * - Admin/HR user create karna (login issue)
 * - Password reset / must_change_password flag
 * - First-run setup (jab koi session exist nahi karta)
 * - System notifications
 *
 * YE CLIENT KABHI BROWSER ME USE NAHI HOTA — service_role RLS bypass karta hai.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY — check .env.local (server-only variable)"
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
