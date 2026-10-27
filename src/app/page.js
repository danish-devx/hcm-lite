import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Entry route:
 * - Logged in          → /dashboard
 * - Setup not done     → /first-run (fresh install)
 * - Setup done         → /login
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("hcm_company_settings")
    .select("setup_done")
    .eq("id", 1)
    .maybeSingle();

  redirect(settings?.setup_done ? "/login" : "/first-run");
}
