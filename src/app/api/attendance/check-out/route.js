import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * POST /api/attendance/check-out — employee self check-out (M4).
 * RPC worked_minutes calculate + half_day rule lagata hai (server-stamped).
 */

export const POST = apiHandler(async () => {
  const { supabase, profile } = await requireAuth();

  if (!profile.employee_id) {
    throw new ApiError(422, "Your login is not linked to an employee record, so attendance cannot be marked.");
  }

  const { data, error } = await supabase.rpc("hcm_check_out");

  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("NO_CHECK_IN_TODAY")) {
      throw new ApiError(422, "No check-in found for today.");
    }
    if (msg.includes("ALREADY_CHECKED_OUT")) {
      throw new ApiError(409, "You have already checked out today.");
    }
    if (msg.includes("NO_EMPLOYEE_LINK")) {
      throw new ApiError(422, "Your login is not linked to an employee record.");
    }
    throw new ApiError(500, msg || "Check-out failed.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: "attendance.check_out",
    entity: "hcm_attendance",
    entityId: row?.id,
    after: { date: row?.date, check_out: row?.check_out, worked_minutes: row?.worked_minutes, status: row?.status },
  });

  return NextResponse.json({ ok: true, data: { attendance: row } });
});
