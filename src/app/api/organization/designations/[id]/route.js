import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * PATCH  /api/organization/designations/[id] — admin-only update
 * DELETE /api/organization/designations/[id] — admin-only delete (FK-safe)
 */

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

export const PATCH = apiHandler(async (request, context) => {
  const { id } = await context.params;
  const body = patchSchema.parse(await request.json());
  const { supabase, user, profile } = await requireAuth(["admin"]);

  const update = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.departmentId !== undefined) update.department_id = body.departmentId;

  const { data: before } = await supabase
    .from("hcm_designations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) throw new ApiError(404, "Designation not found.");

  const { data, error } = await supabase
    .from("hcm_designations")
    .update(update)
    .eq("id", id)
    .select("id, name, department_id, created_at, department:hcm_departments(id, name)")
    .single();

  if (error) throw new ApiError(500, error.message);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "designation_update",
    entity: "hcm_designations",
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
    .from("hcm_designations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) throw new ApiError(404, "Designation not found.");

  const { error } = await supabase.from("hcm_designations").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      throw new ApiError(
        409,
        "Cannot delete — employees are linked to this designation."
      );
    }
    throw new ApiError(500, error.message);
  }

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "designation_delete",
    entity: "hcm_designations",
    entityId: id,
    before,
  });

  return NextResponse.json({ ok: true });
});
