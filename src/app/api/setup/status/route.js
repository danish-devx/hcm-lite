import { NextResponse } from "next/server";

import { apiHandler } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/setup/status — public
 * Login page + root page ise use karte hain taake fresh install
 * par user ko first-run wizard ki taraf bheja ja sake.
 */
export const GET = apiHandler(async () => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("hcm_company_settings")
    .select("setup_done, company_name")
    .eq("id", 1)
    .maybeSingle();

  return NextResponse.json({
    setupDone: Boolean(data?.setup_done),
    companyName: data?.company_name ?? null,
  });
});
