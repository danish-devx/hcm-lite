import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { AssistantClient } from "@/components/modules/ai/assistant-client";

/**
 * /assistant — M8 AI Assistant (F19 chat · F21 smart leave · F22 policy Q&A).
 * Server role + company name pass karta hai; AI calls sirf /api/ai/* se
 * (browser AI provider ko kabhi call nahi karta — brief guardrail).
 */
export default async function AssistantPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { supabase, profile } = session;
  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("company_name")
    .eq("id", 1)
    .maybeSingle();

  return <AssistantClient role={profile.role} companyName={settings?.company_name ?? "Company"} />;
}
