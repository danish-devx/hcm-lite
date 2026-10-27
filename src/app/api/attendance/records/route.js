import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { STATUS_META, fmtWorked, todayInTz } from "@/lib/services/attendance.service";

/**
 * GET /api/attendance/records — HR/Admin records browser (M4).
 * ?from=&to= (default: current month) &status=&q=&page=1 — 20/page.
 * Employee records sirf apne Employee 360 se dekhta hai (RBAC).
 */

const PAGE_SIZE = 20;

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.string().trim().max(30).optional().or(z.literal("")),
  q: z.string().trim().max(80).optional().or(z.literal("")),
  page: z.coerce.number().int().min(1).optional(),
});

export const GET = apiHandler(async (request) => {
  const { supabase } = await requireAuth(["admin", "hr"]);

  const parsed = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const tz = (await supabase.from("hcm_company_settings").select("timezone").eq("id", 1).maybeSingle()).data?.timezone;
  const today = todayInTz(tz ?? "Asia/Karachi");
  const from = parsed.from || `${today.slice(0, 7)}-01`;
  const to = parsed.to || today;

  if (from > to) throw new ApiError(422, "From date must be before the to date.");

  let query = supabase
    .from("hcm_attendance")
    .select(
      `id, date, check_in, check_out, status, source, worked_minutes, created_at,
       hcm_employees:employee_id ( code, full_name, email, hcm_departments:department_id ( name ) )`,
      { count: "exact" }
    )
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .order("check_in", { ascending: false, nullsFirst: false })
    .limit(PAGE_SIZE);

  if (parsed.status) query = query.eq("status", parsed.status);

  const page = parsed.page ?? 1;
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, error, count } = await query;
  if (error) throw new ApiError(500, error.message);

  let rows = (data ?? []).map((r) => ({
    id: r.id,
    date: r.date,
    employee_id: r.hcm_employees?.id ?? null,
    code: r.hcm_employees?.code ?? null,
    full_name: r.hcm_employees?.full_name ?? null,
    email: r.hcm_employees?.email ?? null,
    department_name: r.hcm_employees?.hcm_departments?.name ?? null,
    check_in: r.check_in,
    check_out: r.check_out,
    worked: fmtWorked(r.worked_minutes),
    worked_minutes: r.worked_minutes,
    status: r.status,
    status_label: STATUS_META[r.status]?.label ?? r.status,
    source: r.source,
  }));

  if (parsed.q) {
    const safe = parsed.q.replace(/[%,()]/g, "").toLowerCase();
    if (safe) {
      rows = rows.filter(
        (r) =>
          r.full_name?.toLowerCase().includes(safe) ||
          r.code?.toLowerCase().includes(safe) ||
          r.email?.toLowerCase().includes(safe) ||
          r.department_name?.toLowerCase().includes(safe)
      );
    }
  }

  return NextResponse.json({
    ok: true,
    data: { rows, total: count ?? rows.length, page, pageSize: PAGE_SIZE, from, to },
  });
});
