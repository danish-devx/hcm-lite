import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * GET  /api/organization/departments — staff-wide list (F03)
 * POST /api/organization/departments — admin-only create
 */

const departmentSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(60, "Name is too long"),
  isActive: z.boolean().default(true),
});

export const GET = apiHandler(async () => {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("hcm_departments")
    .select("id, name, is_active, created_at")
    .order("name", { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json({ ok: true, data });
});

export const POST = apiHandler(async (request) => {
  const body = departmentSchema.parse(await request.json());
  const { supabase, user, profile } = await requireAuth(["admin"]);

  // Duplicate guard (case-insensitive)
  const { data: dup } = await supabase
    .from("hcm_departments")
    .select("id")
    .ilike("name", body.name)
    .maybeSingle();
  if (dup) throw new ApiError(409, "A department with this name already exists.");

  const { data, error } = await supabase
    .from("hcm_departments")
    .insert({ name: body.name, is_active: body.isActive })
    .select("id, name, is_active, created_at")
    .single();

  if (error) throw new ApiError(500, error.message);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "department_create",
    entity: "hcm_departments",
    entityId: data.id,
    after: data,
  });

  return NextResponse.json({ ok: true, data }, { status: 201 });
});
