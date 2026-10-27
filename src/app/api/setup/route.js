import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * POST /api/setup — FIRST-RUN SETUP (brief F01, Admin-only by definition)
 * Body me company profile + admin account aata hai (ya env fallback).
 * Sirf ek dafa chal sakta hai (setup_done = true ke baad 409).
 */

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const setupSchema = z.object({
  companyName: z.string().trim().min(2, "Company name is too short").max(80),
  timezone: z.string().trim().min(2).default("Asia/Karachi"),
  officeStart: z
    .string()
    .regex(timeRegex, "Use HH:MM format")
    .default("09:00"),
  graceMinutes: z.coerce.number().int().min(0).max(120).default(15),
  halfDayHours: z.coerce.number().min(1).max(8).default(5),
  weekendDays: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .default([0, 6]),
  officeLat: z.coerce.number().min(-90).max(90).nullable().optional(),
  officeLng: z.coerce.number().min(-180).max(180).nullable().optional(),
  radiusM: z.coerce.number().int().min(30).max(2000).default(150),
  adminFullName: z.string().trim().min(2).max(80).optional(),
  adminEmail: z.string().trim().email().optional(),
  adminPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72)
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number")
    .optional(),
});

export const POST = apiHandler(async (request) => {
  const body = setupSchema.parse(await request.json());

  // Env fallback (brief: "or reads ADMIN_EMAIL / ADMIN_PASSWORD from the env file")
  const adminFullName = body.adminFullName ?? process.env.ADMIN_NAME ?? "Administrator";
  const adminEmail = (body.adminEmail ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const adminPassword = body.adminPassword ?? process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new ApiError(422, "Admin email and password are required.");
  }

  const admin = createAdminClient();

  // 1) Setup lock check
  const { data: existing } = await admin
    .from("hcm_company_settings")
    .select("setup_done")
    .eq("id", 1)
    .maybeSingle();

  if (existing?.setup_done) {
    throw new ApiError(409, "Setup is already completed. Sign in instead.");
  }

  // 2) Admin auth user create (login) — profile trigger role metadata se banati hai
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminFullName,
        role: "admin",
      },
    });

  if (createError) {
    if (/already|exists|registered/i.test(createError.message || "")) {
      throw new ApiError(
        422,
        "This email is already registered. Use a different email, or delete the existing user in Supabase → Authentication → Users."
      );
    }
    throw new ApiError(500, "Admin account could not be created: " + createError.message);
  }

  // 3) Company settings (singleton row)
  const { error: settingsError } = await admin
    .from("hcm_company_settings")
    .upsert({
      id: 1,
      company_name: body.companyName,
      office_start: body.officeStart,
      grace_minutes: body.graceMinutes,
      half_day_hours: body.halfDayHours,
      weekend_days: body.weekendDays,
      office_lat: body.officeLat ?? null,
      office_lng: body.officeLng ?? null,
      radius_m: body.radiusM,
      timezone: body.timezone,
      setup_done: true,
    });

  if (settingsError) {
    throw new ApiError(500, "Company settings could not be saved: " + settingsError.message);
  }

  await writeAudit({
    actorId: created.user.id,
    actorRole: "admin",
    action: "first_run_setup",
    entity: "hcm_company_settings",
    entityId: "1",
    after: {
      company_name: body.companyName,
      office_start: body.officeStart,
      timezone: body.timezone,
      admin_email: adminEmail,
    },
  });

  return NextResponse.json({ ok: true });
});
