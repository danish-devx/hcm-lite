import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * PATCH /api/users/[id] — login ki role ya active status update (admin only).
 * Guards:
 *  - khud ki role/active change nahi kar sakte
 *  - aakhri active admin ko deactivate/demote nahi kar sakte
 */

const patchSchema = z.object({
  role: z.enum(["admin", "hr", "employee"]).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = apiHandler(async (request, context) => {
  const { id } = await context.params;
  const body = patchSchema.parse(await request.json());
  const { admin, supabase, user, profile } = await requireAuth(["admin"]);

  if (Object.keys(body).length === 0) throw new ApiError(422, "Nothing to update.");
  if (id === user.id) {
    throw new ApiError(400, "You cannot change your own role or status.");
  }

  const { data: target } = await supabase
    .from("hcm_profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", id)
    .maybeSingle();
  if (!target) throw new ApiError(404, "Login not found.");

  // Last-active-admin protection
  const losingAdmin =
    target.role === "admin" &&
    ((body.role && body.role !== "admin") || body.isActive === false);
  if (losingAdmin) {
    const { count } = await supabase
      .from("hcm_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("id", id);
    if (!count || count < 1) {
      throw new ApiError(400, "Cannot remove the last active admin. Promote another admin first.");
    }
  }

  const updates = {};
  if (body.role) updates.role = body.role;
  if (body.isActive !== undefined) updates.is_active = body.isActive;

  const { data: after, error } = await admin
    .from("hcm_profiles")
    .update(updates)
    .eq("id", id)
    .select("id, email, full_name, role, is_active, must_change_password, created_at")
    .single();
  if (error) throw new ApiError(500, error.message);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: body.role ? "login.role_change" : "login.status_change",
    entity: "hcm_profiles",
    entityId: id,
    before: { email: target.email, role: target.role, is_active: target.is_active },
    after: { email: after.email, role: after.role, is_active: after.is_active },
  });

  return NextResponse.json({ ok: true, data: after });
});
