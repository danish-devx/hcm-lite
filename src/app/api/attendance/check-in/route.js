import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { geofenceCheck } from "@/lib/services/attendance.service";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * POST /api/attendance/check-in — employee self check-in (M4).
 * Time SERVER ke RPC ke andar stamp hota hai (tamper-proof); browser sirf
 * optional GPS coords bhejta hai. Coords diye gaye to server Haversine se
 * geofence enforce karta hai (office radius).
 *
 * RPC errors → HTTP: ALREADY_CHECKED_IN → 409, NO_EMPLOYEE_LINK → 422.
 */

const bodySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional().nullable(),
  lng: z.coerce.number().min(-180).max(180).optional().nullable(),
  accuracy: z.coerce.number().min(0).max(100000).optional().nullable(),
  source: z.enum(["web", "camera"]).optional(),
});

export const POST = apiHandler(async (request) => {
  const body = bodySchema.parse(await request.json().catch(() => ({})));
  const { supabase, profile } = await requireAuth();

  if (!profile.employee_id) {
    throw new ApiError(422, "Your login is not linked to an employee record, so attendance cannot be marked.");
  }

  // Brief Section 5 (camera bonus): GPS accuracy worse than 100 m → reject.
  // Web check-in lenient rehta hai (location optional), camera strict hai.
  if (body.source === "camera" && body.accuracy != null && Number(body.accuracy) > 100) {
    throw new ApiError(
      422,
      `GPS accuracy is ${Math.round(body.accuracy)} m — worse than the 100 m limit for camera check-in. Move to a clearer view of the sky or use web check-in.`,
      { accuracyM: Math.round(body.accuracy), limitM: 100 }
    );
  }

  // Company settings — geofence + tz ke liye (user-scoped read; policy allows)
  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("office_lat, office_lng, radius_m, timezone")
    .eq("id", 1)
    .maybeSingle();

  const geo = geofenceCheck(settings ?? {}, body.lat ?? null, body.lng ?? null);
  if (geo.enforced && !geo.within) {
    throw new ApiError(
      422,
      `You appear to be ${geo.distanceM} m from the office — outside the ${geo.radiusM} m check-in radius.`,
      { distanceM: geo.distanceM, radiusM: geo.radiusM }
    );
  }

  const { data, error } = await supabase.rpc("hcm_check_in", {
    p_lat: body.lat ?? null,
    p_lng: body.lng ?? null,
    p_accuracy: body.accuracy ?? null,
    p_source: body.source ?? "web",
  });

  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("ALREADY_CHECKED_IN")) {
      throw new ApiError(409, "You have already checked in today.");
    }
    if (msg.includes("NO_EMPLOYEE_LINK")) {
      throw new ApiError(422, "Your login is not linked to an employee record.");
    }
    throw new ApiError(500, msg || "Check-in failed.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: "attendance.check_in",
    entity: "hcm_attendance",
    entityId: row?.id,
    after: { date: row?.date, status: row?.status, source: row?.source, distance_m: geo.distanceM },
  });

  return NextResponse.json(
    { ok: true, data: { attendance: row, distanceM: geo.distanceM, geofenceEnforced: geo.enforced } },
    { status: 201 }
  );
});
