import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { addDaysStr, todayInTz } from "@/lib/services/attendance.service";
import { workingDaysOf } from "@/lib/services/leave.service";

/**
 * GET /api/leave/calendar?month=YYYY-MM — staff team leave calendar (M5)
 *  - Us month ki har day par kaun on-leave hai (approved + pending alag)
 *  - Working days only flag: weekend/holiday bhi marker me aayenge par
 *    UI unhe wash karke dikhata hai
 *  - Employee: 403 (team calendar staff tool hai)
 */

export const GET = apiHandler(async (request) => {
  const { supabase, profile } = await requireAuth();

  if (profile.role !== "admin" && profile.role !== "hr") {
    throw new ApiError(403, "Team leave calendar is available to HR/Admin only.");
  }

  const params = new URL(request.url).searchParams;
  const monthParam = params.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(monthParam)) {
    throw new ApiError(422, "month must be YYYY-MM");
  }

  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("timezone, weekend_days")
    .eq("id", 1)
    .maybeSingle();
  const tz = settings?.timezone ?? "Asia/Karachi";
  const weekendDays = settings?.weekend_days ?? [0, 6];

  const monthStart = `${monthParam}-01`;
  const [y, m] = monthParam.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const monthEnd = addDaysStr(nextMonth, -1);

  const [holRes, reqRes] = await Promise.all([
    supabase
      .from("hcm_holidays")
      .select("date, name")
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .order("date"),
    supabase
      .from("hcm_leave_requests")
      .select(`
        id, employee_id, start_date, end_date, days, status, reason,
        hcm_employees:employee_id ( code, full_name ),
        hcm_leave_types:leave_type_id ( code, name, is_paid )
      `)
      .in("status", ["pending", "approved"])
      .lte("start_date", monthEnd)
      .gte("end_date", monthStart),
  ]);

  const err = holRes.error || reqRes.error;
  if (err) throw new ApiError(500, err.message);

  const holidays = holRes.data ?? [];
  const holidayMap = new Map(holidays.map((h) => [h.date, h.name]));
  const holidaySet = new Set(holidays.map((h) => h.date));

  // Har request ko uske working days me spread karo (month window par clamp —
  // purani/lambi request se 366-cap miss na ho)
  const byDay = {}; // date → [{ requestId, code, name, typeCode, typeName, status, paid }]
  for (const r of reqRes.data ?? []) {
    const s = r.start_date > monthStart ? r.start_date : monthStart;
    const e = r.end_date < monthEnd ? r.end_date : monthEnd;
    const days = workingDaysOf(s, e, weekendDays, holidaySet);
    for (const d of days) {
      (byDay[d] ??= []).push({
        requestId: r.id,
        code: r.hcm_employees?.code ?? null,
        name: r.hcm_employees?.full_name ?? null,
        typeCode: r.hcm_leave_types?.code ?? null,
        typeName: r.hcm_leave_types?.name ?? null,
        paid: r.hcm_leave_types?.is_paid ?? null,
        status: r.status,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      month: monthParam,
      today: todayInTz(tz),
      weekendDays,
      holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
      byDay,
    },
  });
});
