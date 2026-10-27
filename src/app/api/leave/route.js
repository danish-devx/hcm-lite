import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { todayInTz } from "@/lib/services/attendance.service";
import {
  computeBalances,
  countWorkingDays,
  overlappingRequests,
} from "@/lib/services/leave.service";
import { writeAudit } from "@/lib/services/audit.service";
import { notifyUser } from "@/lib/services/notification.service";

/**
 * POST /api/leave — leave request (M5).
 *  - Employee: apne liye (employeeId body me diya to bhi ignore)
 *  - Staff (admin/hr): kisi bhi employee ke liye file kar sakte hain (on-behalf)
 *
 * Server-enforced rules (sab 422/409):
 *  1. start <= end, start >= today (past leave nahi)
 *  2. days = working days (weekend + holidays exclude) — 0 ho to reject
 *  3. Balance: quota wale types me remaining < days → 422
 *  4. Overlap: usi employee ki pending/approved request se date takrao → 409
 *  5. reason required (min 5 chars)
 *  6. Unpaid types (quota null) unlimited — sirf overlap lagu
 */

const applySchema = z.object({
  leaveTypeId: z.string().uuid("Please select a leave type"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date is required"),
  reason: z.string().trim().min(5, "Please give a short reason (min 5 characters)").max(500),
  employeeId: z.string().uuid().optional(), // staff on-behalf only
});

const REQUEST_SELECT = `
  id, employee_id, leave_type_id, start_date, end_date, days, reason, status,
  decision_comment, decided_by, created_at
`;

export const POST = apiHandler(async (request) => {
  const body = applySchema.parse(await request.json());
  const { supabase, profile } = await requireAuth();

  const isStaff = profile.role === "admin" || profile.role === "hr";
  const targetEmployeeId = isStaff && body.employeeId ? body.employeeId : profile.employee_id;

  if (!targetEmployeeId) {
    throw new ApiError(422, "Your login is not linked to an employee record.");
  }

  // ---- Employee + settings context ----
  const { data: employee, error: empErr } = await supabase
    .from("hcm_employees")
    .select("id, code, full_name, status, user_id")
    .eq("id", targetEmployeeId)
    .maybeSingle();
  if (empErr) throw new ApiError(500, empErr.message);
  if (!employee) throw new ApiError(404, "Employee record not found.");
  if (employee.status !== "active") {
    throw new ApiError(422, `${employee.full_name} is not an active employee.`);
  }

  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("timezone, weekend_days")
    .eq("id", 1)
    .maybeSingle();
  const tz = settings?.timezone ?? "Asia/Karachi";
  const today = todayInTz(tz);
  const year = body.startDate.slice(0, 4);

  // ---- Rule 1: date sanity ----
  if (body.endDate < body.startDate) {
    throw new ApiError(422, "End date cannot be before the start date.");
  }
  if (body.startDate < today) {
    throw new ApiError(422, "Leave cannot be applied for a past date.");
  }

  // ---- Meta: type, holidays, weekends ----
  const { data: leaveType, error: ltErr } = await supabase
    .from("hcm_leave_types")
    .select("id, code, name, yearly_quota, is_paid")
    .eq("id", body.leaveTypeId)
    .maybeSingle();
  if (ltErr) throw new ApiError(500, ltErr.message);
  if (!leaveType) throw new ApiError(404, "Leave type not found.");

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const { data: holidays, error: holErr } = await supabase
    .from("hcm_holidays")
    .select("date")
    .gte("date", yearStart)
    .lte("date", yearEnd);
  if (holErr) throw new ApiError(500, holErr.message);
  const holidaySet = new Set((holidays ?? []).map((h) => h.date));

  // ---- Rule 2: working days ----
  const days = countWorkingDays(body.startDate, body.endDate, settings?.weekend_days ?? [0, 6], holidaySet);
  if (days <= 0) {
    throw new ApiError(422, "Selected range has no working days (sirf weekend/holiday hai).");
  }

  // ---- Rule 4: overlap (pending | approved) ----
  const { data: existing, error: exErr } = await supabase
    .from("hcm_leave_requests")
    .select(REQUEST_SELECT)
    .eq("employee_id", targetEmployeeId)
    .in("status", ["pending", "approved"])
    .gte("end_date", body.startDate)
    .lte("start_date", body.endDate);
  if (exErr) throw new ApiError(500, exErr.message);

  const clashes = overlappingRequests(existing ?? [], body.startDate, body.endDate);
  if (clashes.length > 0) {
    const c = clashes[0];
    throw new ApiError(
      409,
      `Dates overlap with a ${c.status} request (${c.start_date} → ${c.end_date}).`
    );
  }

  // ---- Rule 3: balance (quota-based types only) ----
  if (leaveType.yearly_quota != null) {
    const { data: yearReqs, error: yrErr } = await supabase
      .from("hcm_leave_requests")
      .select("leave_type_id, days, status, start_date")
      .eq("employee_id", targetEmployeeId)
      .gte("start_date", `${year}-01-01`)
      .lte("start_date", `${year}-12-31`)
      .in("status", ["pending", "approved"]);
    if (yrErr) throw new ApiError(500, yrErr.message);

    const [bal] = computeBalances([leaveType], yearReqs ?? [], Number(year));
    if (bal && bal.remaining != null && days > bal.remaining) {
      throw new ApiError(
        422,
        `Not enough ${leaveType.name} balance — ${bal.remaining} day(s) remaining, ${days} requested.`
      );
    }
  }

  // ---- Insert ----
  const { data: created, error: insErr } = await supabase
    .from("hcm_leave_requests")
    .insert({
      employee_id: targetEmployeeId,
      leave_type_id: body.leaveTypeId,
      start_date: body.startDate,
      end_date: body.endDate,
      days,
      reason: body.reason,
      status: "pending",
    })
    .select(REQUEST_SELECT)
    .single();
  if (insErr) throw new ApiError(500, insErr.message);

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: isStaff && body.employeeId && body.employeeId !== profile.employee_id
      ? "leave.apply_on_behalf"
      : "leave.apply",
    entity: "hcm_leave_requests",
    entityId: created.id,
    after: {
      employee: employee.code,
      type: leaveType.code,
      start: body.startDate,
      end: body.endDate,
      days,
    },
  });

  // F24 — on-behalf filing par employee ko batao (fail-safe)
  const onBehalf = isStaff && body.employeeId && body.employeeId !== profile.employee_id;
  if (onBehalf && employee.user_id) {
    await notifyUser({
      userId: employee.user_id,
      title: `Leave request filed for you — ${leaveType.name}`,
      body: `${profile.full_name} ne aap ke liye ${days} day(s) (${body.startDate} → ${body.endDate}) file ki — pending approval.`,
      link: "/leave",
    });
  }

  return NextResponse.json(
    { ok: true, data: { ...created, employee, leaveType } },
    { status: 201 }
  );
});
