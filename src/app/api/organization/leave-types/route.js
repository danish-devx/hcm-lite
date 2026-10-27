import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * GET  /api/organization/leave-types — staff-wide list (F04)
 * POST /api/organization/leave-types — admin-only create
 * Paid type needs a yearly quota; unpaid can be unlimited (quota null).
 */

const leaveTypeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9_]{1,23}$/, "Use lowercase letters/numbers, start with a letter"),
    name: z.string().trim().min(2, "Name is too short").max(60),
    isPaid: z.boolean(),
    yearlyQuota: z.coerce.number().min(0.5, "Minimum 0.5").max(365).nullable().optional(),
  })
  .refine((v) => !v.isPaid || v.yearlyQuota != null, {
    message: "Paid leave types need a yearly quota",
    path: ["yearlyQuota"],
  });

export const GET = apiHandler(async () => {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("hcm_leave_types")
    .select("id, code, name, yearly_quota, is_paid, created_at")
    .order("name", { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json({ ok: true, data });
});

export const POST = apiHandler(async (request) => {
  const body = leaveTypeSchema.parse(await request.json());
  const { supabase, user, profile } = await requireAuth(["admin"]);

  const { data: dup } = await supabase
    .from("hcm_leave_types")
    .select("id")
    .or(`code.eq.${body.code},name.ilike.${body.name}`)
    .maybeSingle();
  if (dup) throw new ApiError(409, "A leave type with this code or name already exists.");

  const { data, error } = await supabase
    .from("hcm_leave_types")
    .insert({
      code: body.code,
      name: body.name,
      is_paid: body.isPaid,
      yearly_quota: body.isPaid ? body.yearlyQuota : body.yearlyQuota ?? null,
    })
    .select("id, code, name, yearly_quota, is_paid, created_at")
    .single();

  if (error) throw new ApiError(500, error.message);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "leave_type_create",
    entity: "hcm_leave_types",
    entityId: data.id,
    after: data,
  });

  return NextResponse.json({ ok: true, data }, { status: 201 });
});
