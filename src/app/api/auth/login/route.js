import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1, "Password is required"),
});

export const POST = apiHandler(async (request) => {
  const { email, password } = loginSchema.parse(await request.json());

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const { data: profile } = await supabase
    .from("hcm_profiles")
    .select(
      "id, email, full_name, role, employee_id, is_active, must_change_password"
    )
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    throw new ApiError(403, "Profile not found. Contact your administrator.");
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    throw new ApiError(403, "Your account has been deactivated. Contact Admin.");
  }

  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
    profile,
    mustChangePassword: profile.must_change_password,
  });
});
