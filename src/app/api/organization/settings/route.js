import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * GET  /api/organization/settings — staff-wide read (F03)
 * PATCH /api/organization/settings — admin-only update
 */

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const settingsSchema = z.object({
  companyName: z.string().trim().min(2, "Company name is too short").max(80),
  timezone: z.string().trim().min(2).max(60),
  officeStart: z.string().regex(timeRegex, "Use HH:MM format"),
  graceMinutes: z.coerce.number().int().min(0, "Cannot be negative").max(120),
  halfDayHours: z.coerce.number().min(1, "Minimum 1 hour").max(8, "Maximum 8 hours"),
  weekendDays: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Select at least one weekend day")
    .max(7),
  officeLat: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().min(-90).max(90).nullable()
  ),
  officeLng: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().min(-180).max(180).nullable()
  ),
  radiusM: z.coerce.number().int().min(30, "Minimum 30 meters").max(2000).optional(),
});

function toCamel(row) {
  if (!row) return null;
  return {
    companyName: row.company_name,
    timezone: row.timezone,
    officeStart: (row.office_start ?? "").slice(0, 5),
    graceMinutes: row.grace_minutes,
    halfDayHours: Number(row.half_day_hours),
    weekendDays: row.weekend_days ?? [],
    officeLat: row.office_lat,
    officeLng: row.office_lng,
    radiusM: row.radius_m,
    setupDone: row.setup_done,
  };
}

export const GET = apiHandler(async () => {
  const { supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("hcm_company_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);

  return NextResponse.json({ ok: true, data: toCamel(data) });
});

export const PATCH = apiHandler(async (request) => {
  const body = settingsSchema.parse(await request.json());
  const { supabase, user, profile } = await requireAuth(["admin"]);

  const { data: before } = await supabase
    .from("hcm_company_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("hcm_company_settings")
    .update({
      company_name: body.companyName,
      timezone: body.timezone,
      office_start: body.officeStart.slice(0, 5),
      grace_minutes: body.graceMinutes,
      half_day_hours: body.halfDayHours,
      weekend_days: body.weekendDays,
      office_lat: body.officeLat ?? null,
      office_lng: body.officeLng ?? null,
      radius_m: body.radiusM ?? before?.radius_m ?? 150,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("*")
    .single();

  if (error) throw new ApiError(500, error.message);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "settings_update",
    entity: "hcm_company_settings",
    entityId: "1",
    before: before ? toCamel(before) : null,
    after: toCamel(data),
  });

  return NextResponse.json({ ok: true, data: toCamel(data) });
});
