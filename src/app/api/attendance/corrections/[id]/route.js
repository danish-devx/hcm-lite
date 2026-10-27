import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { applyCorrectionToAttendance } from "@/lib/services/attendance.service";
import { writeAudit } from "@/lib/services/audit.service";
import { notifyUser } from "@/lib/services/notification.service";

/**
 * PATCH /api/attendance/corrections/[id] — HR/Admin decide (M4):
 *   { decision: "approve" | "reject", comment? }
 * Approve par correction hcm_attendance par apply hoti hai (status recompute),
 * reject par sirf status update. Employee ko PATCH allowed nahi (RBAC).
 */

const patchSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(300).optional().or(z.literal("")),
});

export const PATCH = apiHandler(async (request, { params }) => {
  const { id } = await params;
  const body = patchSchema.parse(await request.json());
  const { supabase, admin, profile } = await requireAuth(["admin", "hr"]);

  // Request load (service-role se — decided rows bhi dikh jayein ek full read me)
  const { data: correction, error: loadErr } = await admin
    .from("hcm_attendance_corrections")
    .select("id, employee_id, date, requested_check_in, requested_check_out, reason, status")
    .eq("id", id)
    .maybeSingle();
  if (loadErr || !correction) throw new ApiError(404, "Correction request not found.");

  if (correction.status !== "pending") {
    throw new ApiError(409, `This correction was already ${correction.status}.`);
  }

  let appliedRow = null;
  if (body.decision === "approve") {
    // Settings + employee tz — attendance rules apply karne ke liye
    const { data: settings } = await admin
      .from("hcm_company_settings")
      .select("office_start, grace_minutes, half_day_hours, weekend_days, timezone")
      .eq("id", 1)
      .maybeSingle();

    appliedRow = await applyCorrectionToAttendance({
      admin,
      settings: settings ?? { timezone: "Asia/Karachi" },
      employeeId: correction.employee_id,
      dateStr: correction.date,
      checkInIso: correction.requested_check_in,
      checkOutIso: correction.requested_check_out,
    });
  }

  const { data: updated, error: updErr } = await admin
    .from("hcm_attendance_corrections")
    .update({
      status: body.decision === "approve" ? "approved" : "rejected",
      decided_by: profile.id,
      decision_comment: body.comment || null,
    })
    .eq("id", id)
    .select()
    .single();
  if (updErr) throw new ApiError(500, updErr.message);

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: body.decision === "approve" ? "attendance.correction_approve" : "attendance.correction_reject",
    entity: "hcm_attendance_corrections",
    entityId: id,
    before: { status: "pending" },
    after: {
      status: updated.status,
      comment: updated.decision_comment,
      applied: appliedRow
        ? { check_in: appliedRow.check_in, check_out: appliedRow.check_out, status: appliedRow.status }
        : null,
    },
  });

  // F24 — employee ko decision ki in-app notification (fail-safe)
  const { data: empUser } = await admin
    .from("hcm_employees")
    .select("user_id")
    .eq("id", correction.employee_id)
    .maybeSingle();
  if (empUser?.user_id) {
    await notifyUser({
      userId: empUser.user_id,
      title: `Attendance correction ${body.decision === "approve" ? "approved" : "rejected"} — ${correction.date}`,
      body: body.comment
        ? `Reviewer note: “${body.comment}”`
        : "Attendance record updated accordingly.",
      link: "/attendance",
    });
  }

  return NextResponse.json({ ok: true, data: { correction: updated, applied: appliedRow } });
});
