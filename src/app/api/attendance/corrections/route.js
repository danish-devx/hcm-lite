import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { todayInTz, wallToUtcIso } from "@/lib/services/attendance.service";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * GET  /api/attendance/corrections?status=pending|approved|rejected
 *   — staff: sab ki requests; employee: sirf apni (data-scope server par).
 * POST /api/attendance/corrections — employee apni correction request (M4):
 *   { date, requestedCheckIn?, requestedCheckOut?, reason } — reason zaroori.
 *   Future date / 60 din se purani date / duplicate pending request = 422|409.
 */

const CORRECTION_SELECT = `
  id, employee_id, date, requested_check_in, requested_check_out, reason,
  status, decided_by, decision_comment, created_at,
  hcm_employees:employee_id ( code, full_name, email )
`;

const createSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required (YYYY-MM-DD)"),
    requestedCheckIn: z.string().regex(/^\d{2}:\d{2}$/, "Time format HH:MM").optional().or(z.literal("")),
    requestedCheckOut: z.string().regex(/^\d{2}:\d{2}$/, "Time format HH:MM").optional().or(z.literal("")),
    reason: z.string().trim().min(5, "Please give a short reason (min 5 characters)").max(300),
  })
  .refine((v) => v.requestedCheckIn || v.requestedCheckOut, {
    message: "Provide the correct check-in, check-out, or both",
    path: ["requestedCheckIn"],
  });

export const GET = apiHandler(async (request) => {
  const { supabase, profile } = await requireAuth();
  const status = new URL(request.url).searchParams.get("status") ?? "";

  let query = supabase
    .from("hcm_attendance_corrections")
    .select(CORRECTION_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);

  if (profile.role === "employee") {
    query = query.eq("employee_id", profile.employee_id);
  }
  if (status === "pending" || status === "approved" || status === "rejected") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);

  const rows = (data ?? []).map((r) => ({
    ...r,
    code: r.hcm_employees?.code ?? null,
    full_name: r.hcm_employees?.full_name ?? null,
    hcm_employees: undefined,
  }));

  return NextResponse.json({ ok: true, data: rows });
});

export const POST = apiHandler(async (request) => {
  const body = createSchema.parse(await request.json());
  const { supabase, profile } = await requireAuth();

  if (!profile.employee_id) {
    throw new ApiError(422, "Your login is not linked to an employee record.");
  }

  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("timezone")
    .eq("id", 1)
    .maybeSingle();
  const tz = settings?.timezone ?? "Asia/Karachi";
  const today = todayInTz(tz);

  if (body.date > today) throw new ApiError(422, "Correction date cannot be in the future.");
  const minDate = new Date(`${today}T00:00:00Z`);
  minDate.setUTCDate(minDate.getUTCDate() - 60);
  if (body.date < minDate.toISOString().slice(0, 10)) {
    throw new ApiError(422, "Corrections can only be requested for the last 60 days.");
  }

  if (body.requestedCheckIn && body.requestedCheckOut && body.requestedCheckOut <= body.requestedCheckIn) {
    throw new ApiError(422, "Check-out must be after check-in.");
  }

  const { data: dup } = await supabase
    .from("hcm_attendance_corrections")
    .select("id")
    .eq("employee_id", profile.employee_id)
    .eq("date", body.date)
    .eq("status", "pending")
    .maybeSingle();
  if (dup) throw new ApiError(409, "A correction for this date is already pending review.");

  const checkInIso = body.requestedCheckIn
    ? wallToUtcIso(body.date, body.requestedCheckIn, tz)
    : null;
  const checkOutIso = body.requestedCheckOut
    ? wallToUtcIso(body.date, body.requestedCheckOut, tz)
    : null;

  const { data, error } = await supabase
    .from("hcm_attendance_corrections")
    .insert({
      employee_id: profile.employee_id,
      date: body.date,
      requested_check_in: checkInIso,
      requested_check_out: checkOutIso,
      reason: body.reason,
      status: "pending",
    })
    .select(CORRECTION_SELECT)
    .single();

  if (error) throw new ApiError(500, error.message);

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: "attendance.correction_request",
    entity: "hcm_attendance_corrections",
    entityId: data.id,
    after: { date: data.date, reason: data.reason },
  });

  return NextResponse.json({ ok: true, data }, { status: 201 });
});
