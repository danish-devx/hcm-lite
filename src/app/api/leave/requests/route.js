import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";

/**
 * GET /api/leave/requests?status=&type=&q=&page= — leave requests (M5)
 *  - staff (admin/hr): sab ke requests — approval inbox + history browser
 *  - employee: sirf apni (data-scope server par)
 * Filters: status (pending|approved|rejected|cancelled), leaveTypeId, q
 * (name/email/code), from/to date range. Pending pehle, phir newest.
 */

const REQUEST_SELECT = `
  id, employee_id, leave_type_id, start_date, end_date, days, reason, status,
  decision_comment, decided_by, created_at,
  hcm_employees:employee_id ( code, full_name, email ),
  hcm_leave_types:leave_type_id ( code, name, is_paid )
`;

const PAGE_SIZE = 20;

export const GET = apiHandler(async (request) => {
  const { supabase, profile } = await requireAuth();
  const params = new URL(request.url).searchParams;

  const status = params.get("status") ?? "";
  const leaveTypeId = params.get("type") ?? "";
  const q = (params.get("q") ?? "").trim().slice(0, 60);
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  let query = supabase
    .from("hcm_leave_requests")
    .select(REQUEST_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (profile.role === "employee") {
    query = query.eq("employee_id", profile.employee_id);
  }
  if (["pending", "approved", "rejected", "cancelled"].includes(status)) {
    query = query.eq("status", status);
  }
  if (leaveTypeId) query = query.eq("leave_type_id", leaveTypeId);
  if (from) query = query.gte("end_date", from);
  if (to) query = query.lte("start_date", to);
  if (q) {
    const safe = q.replace(/[%_,()]/g, " ").trim();
    if (safe) {
      query = query.or(
        `hcm_employees.full_name.ilike.%${safe}%,hcm_employees.email.ilike.%${safe}%,hcm_employees.code.ilike.%${safe}%`
      );
    }
  }

  const { data, error, count } = await query;
  if (error) throw new ApiError(500, error.message);

  const rows = (data ?? []).map((r) => ({
    ...r,
    code: r.hcm_employees?.code ?? null,
    full_name: r.hcm_employees?.full_name ?? null,
    email: r.hcm_employees?.email ?? null,
    type_code: r.hcm_leave_types?.code ?? null,
    type_name: r.hcm_leave_types?.name ?? null,
    type_paid: r.hcm_leave_types?.is_paid ?? null,
    hcm_employees: undefined,
    hcm_leave_types: undefined,
  }));

  return NextResponse.json({
    ok: true,
    data: { rows, total: count ?? rows.length, page, pageSize: PAGE_SIZE },
  });
});
