import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";
import { notifyUser } from "@/lib/services/notification.service";

/**
 * PATCH /api/leave/requests/[id] — staff decision (M5)
 *  { action: "approve" | "reject", comment? }
 *  - Sirf pending request decide ho sakti hai (already-decided → 409)
 *  - approve → status=approved + decided_by=me; reject w/ optional comment
 *  - Approved leave attendance me on_leave status deta hai (Phase 4 hook)
 */

const decideSchema = z.object({
  action: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(300).optional().or(z.literal("")),
});

export const PATCH = apiHandler(async (request, { params }) => {
  const { id } = await params;
  const body = decideSchema.parse(await request.json());
  const { supabase, profile } = await requireAuth();

  if (profile.role !== "admin" && profile.role !== "hr") {
    throw new ApiError(403, "Only HR/Admin can decide leave requests.");
  }

  const { data: existing, error: exErr } = await supabase
    .from("hcm_leave_requests")
    .select(`
      id, employee_id, leave_type_id, start_date, end_date, days, reason, status,
      decided_by,
      hcm_employees:employee_id ( code, full_name, user_id ),
      hcm_leave_types:leave_type_id ( code, name )
    `)
    .eq("id", id)
    .maybeSingle();
  if (exErr) throw new ApiError(500, exErr.message);
  if (!existing) throw new ApiError(404, "Leave request not found.");
  if (existing.status !== "pending") {
    throw new ApiError(409, `This request is already ${existing.status}.`);
  }

  const nextStatus = body.action === "approve" ? "approved" : "rejected";
  const { data: updated, error: upErr } = await supabase
    .from("hcm_leave_requests")
    .update({
      status: nextStatus,
      decided_by: profile.id,
      decision_comment: body.comment || null,
    })
    .eq("id", id)
    .eq("status", "pending") // race-guard: dobara pending check
    .select()
    .single();
  if (upErr) throw new ApiError(500, upErr.message);
  if (!updated) throw new ApiError(409, "Request was just decided by someone else.");

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: `leave.${nextStatus}`,
    entity: "hcm_leave_requests",
    entityId: id,
    before: { status: "pending" },
    after: {
      employee: existing.hcm_employees?.code,
      type: existing.hcm_leave_types?.code,
      start: existing.start_date,
      end: existing.end_date,
      days: existing.days,
      comment: body.comment || null,
    },
  });

  // F24 — employee ko decision ki in-app notification (fail-safe)
  if (existing.hcm_employees?.user_id) {
    const range = `${existing.start_date} → ${existing.end_date}`;
    await notifyUser({
      userId: existing.hcm_employees.user_id,
      title: `Leave ${nextStatus} — ${existing.hcm_leave_types?.name ?? "Leave"}`,
      body: `${existing.days} day(s) · ${range}${body.comment ? ` — “${body.comment}”` : ""}`,
      link: "/leave",
    });
  }

  return NextResponse.json({ ok: true, data: updated });
});
