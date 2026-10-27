import { NextResponse } from "next/server";

import { apiHandler } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";

export const POST = apiHandler(async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
});
