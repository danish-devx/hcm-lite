import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";
import { generateTempPassword } from "@/lib/services/employee.service";

/**
 * POST /api/employees/[id]/reset-password — employee ke login ka temp password issue karein.
 * Rules:
 *  - Employee-linked account → admin + hr dono reset kar sakte hain
 *  - HR/Admin account → sirf admin
 * Temp password response me SIRF EK DAFA aata hai; must_change_password flag lag jata hai.
 */
export const POST = apiHandler(async (_request, context) => {
  const { id } = await context.params;
  const { admin, supabase, user, profile } = await requireAuth(["admin", "hr"]);

  const { data: employee } = await supabase
    .from("hcm_employees")
    .select("id, code, full_name, email, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!employee) throw new ApiError(404, "Employee not found.");
  if (!employee.user_id) throw new ApiError(404, "This employee has no login account.");

  const { data: targetProfile } = await supabase
    .from("hcm_profiles")
    .select("id, email, role")
    .eq("id", employee.user_id)
    .maybeSingle();
  if (!targetProfile) throw new ApiError(404, "Login profile not found.");

  // HR dusre HR/admin ka password reset nahi kar sakta
  if (targetProfile.role !== "employee" && profile.role !== "admin") {
    throw new ApiError(403, "Only an admin can reset staff logins.");
  }

  const tempPassword = generateTempPassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(targetProfile.id, {
    password: tempPassword,
  });
  if (updateError) throw new ApiError(500, `Password reset failed: ${updateError.message}`);

  const { error: flagError } = await admin
    .from("hcm_profiles")
    .update({ must_change_password: true, is_active: true })
    .eq("id", targetProfile.id);
  if (flagError) throw new ApiError(500, `Password reset but flag failed: ${flagError.message}`);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "login.password_reset",
    entity: "hcm_profiles",
    entityId: targetProfile.id,
    after: { email: targetProfile.email, linked_employee: employee.code, by: profile.role },
  });

  return NextResponse.json({ ok: true, data: { tempPassword, email: targetProfile.email } });
});
