import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * POST /api/leave/requests/[id]/cancel — cancel pending request (M5)
 *  - Employee: SIRF apni pending request — SECURITY DEFINER RPC
 *    hcm_cancel_my_leave (RLS bypass nahi, ownership RPC ke andar check hota hai)
 *  - Staff (admin/hr): kisi bhi pending request ko cancel kar sakte hain
 *  - approved/rejected/cancelled → 409
 */

export const POST = apiHandler(async (request, { params }) => {
  const { id } = await params;
  const { supabase, profile } = await requireAuth();

  const { data: existing, error: exErr } = await supabase
    .from("hcm_leave_requests")
    .select(`
      id, employee_id, status, start_date, end_date, days,
      hcm_employees:employee_id ( code, full_name ),
      hcm_leave_types:leave_type_id ( code, name )
    `)
    .eq("id", id)
    .maybeSingle();
  if (exErr) throw new ApiError(500, exErr.message);
  if (!existing) throw new ApiError(404, "Leave request not found.");

  const isStaff = profile.role === "admin" || profile.role === "hr";
  const isOwn = profile.employee_id && existing.employee_id === profile.employee_id;

  if (existing.status !== "pending") {
    throw new ApiError(409, `Only pending requests can be cancelled (this one is ${existing.status}).`);
  }

  if (isStaff && !isOwn) {
    // Staff cancel — direct update (RLS leave_decide_staff policy allow karta hai)
    const { error: upErr } = await supabase
      .from("hcm_leave_requests")
      .update({ status: "cancelled", decided_by: profile.id })
      .eq("id", id)
      .eq("status", "pending");
    if (upErr) throw new ApiError(500, upErr.message);
  } else if (isOwn) {
    // Owner cancel — RPC (employee RLS update nahi kar sakta, RPC hi rasta hai)
    const { error: rpcErr } = await supabase.rpc("hcm_cancel_my_leave", {
      p_request_id: id,
    });
    if (rpcErr) {
      if (String(rpcErr.message).includes("LEAVE_NOT_CANCELLABLE")) {
        throw new ApiError(409, "Only pending requests can be cancelled.");
      }
      throw new ApiError(500, rpcErr.message);
    }
  } else {
    throw new ApiError(403, "You can only cancel your own leave requests.");
  }

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: isStaff && !isOwn ? "leave.cancel_staff" : "leave.cancel",
    entity: "hcm_leave_requests",
    entityId: id,
    before: { status: "pending" },
    after: {
      employee: existing.hcm_employees?.code,
      type: existing.hcm_leave_types?.code,
      start: existing.start_date,
      end: existing.end_date,
    },
  });

  return NextResponse.json({ ok: true, data: { id, status: "cancelled" } });
});
