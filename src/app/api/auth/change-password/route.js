import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

const schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(72)
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const POST = apiHandler(async (request) => {
  const body = schema.parse(await request.json());
  const { supabase, admin, user, profile } = await requireAuth();

  // 1) Current password verify — security best practice
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: body.currentPassword,
  });
  if (verifyError) {
    throw new ApiError(422, "Current password is incorrect.");
  }

  // 2) Update password (session client — apna hi account)
  const { error: updateError } = await supabase.auth.updateUser({
    password: body.newPassword,
  });
  if (updateError) {
    throw new ApiError(422, "Password could not be updated: " + updateError.message);
  }

  // 3) Temporary-password flag clear (service role — sensitive field)
  await admin
    .from("hcm_profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "password_changed",
    entity: "hcm_profiles",
    entityId: user.id,
  });

  return NextResponse.json({ ok: true });
});
