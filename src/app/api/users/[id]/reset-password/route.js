import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";
import { generateTempPassword } from "@/lib/services/employee.service";

/**
 * POST /api/users/[id]/reset-password — kisi bhi login ka temp password issue (admin only).
 * Employee 360 wala reset employee-linked accounts ke liye hai; ye general hai.
 */
export const POST = apiHandler(async (_request, context) => {
  const { id } = await context.params;
  const { admin, supabase, user, profile } = await requireAuth(["admin"]);

  const { data: target } = await supabase
    .from("hcm_profiles")
    .select("id, email, role")
    .eq("id", id)
    .maybeSingle();
  if (!target) throw new ApiError(404, "Login not found.");

  const tempPassword = generateTempPassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(target.id, {
    password: tempPassword,
  });
  if (updateError) throw new ApiError(500, `Password reset failed: ${updateError.message}`);

  const { error: flagError } = await admin
    .from("hcm_profiles")
    .update({ must_change_password: true, is_active: true })
    .eq("id", target.id);
  if (flagError) throw new ApiError(500, `Password reset but flag failed: ${flagError.message}`);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "login.password_reset",
    entity: "hcm_profiles",
    entityId: target.id,
    after: { email: target.email, role: target.role },
  });

  return NextResponse.json({ ok: true, data: { tempPassword, email: target.email } });
});
