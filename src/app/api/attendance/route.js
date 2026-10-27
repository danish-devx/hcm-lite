import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import {
  STATUS_META,
  addDaysStr,
  effectiveStatus,
  fmtWorked,
  todayInTz,
  weekdayOf,
} from "@/lib/services/attendance.service";

/**
 * GET /api/attendance?date=YYYY-MM-DD&department=<uuid>&q=<name|code>
 *   — HR/Admin DAILY BOARD (M4): har active employee us date ka effective
 *     status + summary counts. Employee sirf /me dekh sakta hai (RBAC).
 *
 * Status rules (brief): absent if no record and no approved leave;
 * missing_checkout if no check-out; late/half_day record se.
 */

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  department: z.string().uuid().optional().or(z.literal("")),
  q: z.string().trim().max(80).optional().or(z.literal("")),
});

export const GET = apiHandler(async (request) => {
  const { supabase } = await requireAuth(["admin", "hr"]); // employee ko daily board nahi dikhta

  const parsed = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const date = parsed.date || "";

  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("weekend_days, timezone, office_start, grace_minutes, half_day_hours")
    .eq("id", 1)
    .maybeSingle();

  const tz = settings?.timezone ?? "Asia/Karachi";
  const today = todayInTz(tz);
  const boardDate = date || today;

  if (boardDate > today) {
    throw new ApiError(422, "Future dates ka board abhi nahi ban sakta.");
  }

  const weekendDays = settings?.weekend_days ?? [0, 6];
  const isWeekend = weekendDays.includes(weekdayOf(boardDate));

  // Parallel: employees + us date ke attendance + approved leaves + holidays
  const [empRes, attRes, leaveRes, holRes] = await Promise.all([
    supabase
      .from("hcm_employees")
      .select(
        `id, code, full_name, email, department_id, status,
         hcm_departments:department_id ( name )`
      )
      .eq("status", "active")
      .order("full_name", { ascending: true }),
    supabase
      .from("hcm_attendance")
      .select("employee_id, date, check_in, check_out, status, source, worked_minutes")
      .eq("date", boardDate),
    supabase
      .from("hcm_leave_requests")
      .select("employee_id, start_date, end_date, status")
      .eq("status", "approved")
      .lte("start_date", boardDate)
      .gte("end_date", boardDate),
    supabase.from("hcm_holidays").select("date, name").gte("date", boardDate).lte("date", boardDate),
  ]);

  const err = empRes.error || attRes.error || leaveRes.error || holRes.error;
  if (err) throw new ApiError(500, err.message);

  let employees = empRes.data ?? [];
  if (parsed.department) employees = employees.filter((e) => e.department_id === parsed.department);
  if (parsed.q) {
    const safe = parsed.q.replace(/[%,()]/g, "").toLowerCase();
    if (safe) {
      employees = employees.filter(
        (e) =>
          e.full_name?.toLowerCase().includes(safe) ||
          e.code?.toLowerCase().includes(safe) ||
          e.email?.toLowerCase().includes(safe)
      );
    }
  }

  const attByEmp = new Map((attRes.data ?? []).map((r) => [r.employee_id, r]));
  const leaveByEmp = new Map((leaveRes.data ?? []).map((l) => [l.employee_id, l]));
  const isHoliday = (holRes.data ?? []).length > 0;
  const holidayName = (holRes.data ?? [])[0]?.name ?? null;
  const relation = boardDate < today ? "past" : "today";

  const rows = employees.map((e) => {
    const record = attByEmp.get(e.id) ?? null;
    const status = effectiveStatus({
      record,
      leave: leaveByEmp.get(e.id) ?? null,
      isWeekend,
      isHoliday,
      relation,
    });
    return {
      employee_id: e.id,
      code: e.code,
      full_name: e.full_name,
      email: e.email,
      department_name: e.hcm_departments?.name ?? null,
      check_in: record?.check_in ?? null,
      check_out: record?.check_out ?? null,
      worked: fmtWorked(record?.worked_minutes),
      worked_minutes: record?.worked_minutes ?? null,
      source: record?.source ?? null,
      status,
      status_label: STATUS_META[status]?.label ?? status,
    };
  });

  // Summary counts
  const summary = { total: rows.length };
  for (const row of rows) summary[row.status] = (summary[row.status] ?? 0) + 1;

  return NextResponse.json({
    ok: true,
    data: {
      date: boardDate,
      today,
      timezone: tz,
      is_weekend: isWeekend,
      is_holiday: isHoliday,
      holiday_name: holidayName,
      office_start: settings?.office_start ?? "09:00",
      rows,
      summary,
    },
  });
});
