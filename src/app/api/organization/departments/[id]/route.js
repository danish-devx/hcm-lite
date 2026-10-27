import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * PATCH  /api/organization/departments/[id] — admin-only update
 * DELETE /api/organization/departments/[id] — admin-only delete (FK-safe)
 */

const patchSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(60).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = apiHandler(async (request, context) => {
  const { id } = await context.params;
  const body = patchSchema.parse(await request.json());
  const { supabase, user, profile } = await requireAuth(["admin"]);

  if (body.name) {
    const { data: dup } = await supabase
      .from("hcm_departments")
      .select("id")
      .ilike("name", body.name)
      .neq("id", id)
      .maybeSingle();
    if (dup) throw new ApiError(409, "A department with this name already exists.");
  }

  const update = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.isActive !== undefined) update.is_active = body.isActive;

  const { data: before } = await supabase
    .from("hcm_departments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) throw new ApiError(404, "Department not found.");

  const { data, error } = await supabase
    .from("hcm_departments")
    .update(update)
    .eq("id", id)
    .select("id, name, is_active, created_at")
    .single();

  if (error) throw new ApiError(500, error.message);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "department_update",
    entity: "hcm_departments",
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
    .from("hcm_departments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) throw new ApiError(404, "Department not found.");

  const { error } = await supabase.from("hcm_departments").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      throw new ApiError(
        409,
        "Cannot delete — designations or employees are linked to this department. Deactivate it instead."
      );
    }
    throw new ApiError(500, error.message);
  }

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "department_delete",
    entity: "hcm_departments",
    entityId: id,
    before,
  });

  return NextResponse.json({ ok: true });
});
