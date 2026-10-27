import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * PATCH  /api/organization/leave-types/[id] — admin-only update
 * DELETE /api/organization/leave-types/[id] — admin-only delete (FK-safe)
 */

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    isPaid: z.boolean().optional(),
    yearlyQuota: z.coerce.number().min(0.5).max(365).nullable().optional(),
  })
  .refine((v) => v.isPaid !== true || v.yearlyQuota != null, {
    message: "Paid leave types need a yearly quota",
    path: ["yearlyQuota"],
  });

export const PATCH = apiHandler(async (request, context) => {
  const { id } = await context.params;
  const body = patchSchema.parse(await request.json());
  const { supabase, user, profile } = await requireAuth(["admin"]);

  const update = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.isPaid !== undefined) update.is_paid = body.isPaid;
  if (body.yearlyQuota !== undefined) update.yearly_quota = body.yearlyQuota;

  const { data: before } = await supabase
    .from("hcm_leave_types")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) throw new ApiError(404, "Leave type not found.");

  const { data, error } = await supabase
    .from("hcm_leave_types")
    .update(update)
    .eq("id", id)
    .select("id, code, name, yearly_quota, is_paid, created_at")
    .single();

  if (error) throw new ApiError(500, error.message);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "leave_type_update",
    entity: "hcm_leave_types",
    entityId: id,
    before,
    after: data,
  });

  return NextResponse.json({ ok: true, data });
});

export const DELETE = apiHandler(async (request, context) => {
  const { id } = await context.params;
  const { supabase, user, profile } = await requireAuth(["admin"]);

  const { data: before } = await supabase
    .from("hcm_leave_types")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) throw new ApiError(404, "Leave type not found.");

  const { error } = await supabase.from("hcm_leave_types").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      throw new ApiError(
        409,
        "Cannot delete — leave requests exist for this type. Deactivate or keep it for history."
      );
    }
    throw new ApiError(500, error.message);
  }

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "leave_type_delete",
    entity: "hcm_leave_types",
    entityId: id,
    before,
  });

  return NextResponse.json({ ok: true });
});
