import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * GET  /api/organization/holidays — staff-wide list (F04)
 * POST /api/organization/holidays — admin-only create
 */

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const holidaySchema = z.object({
  date: z.string().regex(dateRegex, "Pick a valid date"),
  name: z.string().trim().min(2, "Name is too short").max(80),
});

export const GET = apiHandler(async () => {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("hcm_holidays")
    .select("id, date, name, created_at")
    .order("date", { ascending: true });

  if (error) throw new ApiError(500, error.message);
  return NextResponse.json({ ok: true, data });
});

export const POST = apiHandler(async (request) => {
  const body = holidaySchema.parse(await request.json());
  const { supabase, user, profile } = await requireAuth(["admin"]);

  const { data: dup } = await supabase
    .from("hcm_holidays")
    .select("id")
    .eq("date", body.date)
    .maybeSingle();
  if (dup) throw new ApiError(409, "A holiday already exists on this date.");

  const { data, error } = await supabase
    .from("hcm_holidays")
    .insert({ date: body.date, name: body.name })
    .select("id, date, name, created_at")
    .single();

  if (error) throw new ApiError(500, error.message);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "holiday_create",
    entity: "hcm_holidays",
    entityId: data.id,
    after: data,
  });

  return NextResponse.json({ ok: true, data }, { status: 201 });
});
