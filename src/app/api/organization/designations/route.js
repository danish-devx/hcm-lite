import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * GET  /api/organization/designations — staff-wide list (F03)
 * POST /api/organization/designations — admin-only create
 */

const designationSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80, "Name is too long"),
  departmentId: z.string().uuid("Select a valid department").nullable().optional(),
});

export const GET = apiHandler(async () => {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("hcm_designations")
    .select("id, name, department_id, created_at, department:hcm_departments(id, name)")
    .order("name", { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json({ ok: true, data });
});

export const POST = apiHandler(async (request) => {
  const body = designationSchema.parse(await request.json());
  const { supabase, user, profile } = await requireAuth(["admin"]);

  // Same title in the same department = duplicate
  let query = supabase
    .from("hcm_designations")
    .select("id")
    .ilike("name", body.name);
  if (body.departmentId) {
    query = query.eq("department_id", body.departmentId);
  } else {
    query = query.is("department_id", null);
  }
  const { data: dup } = await query.maybeSingle();
  if (dup) {
    throw new ApiError(409, "This designation already exists in the selected department.");
  }

  const { data, error } = await supabase
    .from("hcm_designations")
    .insert({ name: body.name, department_id: body.departmentId ?? null })
    .select("id, name, department_id, created_at, department:hcm_departments(id, name)")
    .single();

  if (error) throw new ApiError(500, error.message);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "designation_create",
    entity: "hcm_designations",
    entityId: data.id,
    after: data,
  });

  return NextResponse.json({ ok: true, data }, { status: 201 });
});
