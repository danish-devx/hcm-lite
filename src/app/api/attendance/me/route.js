import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import {
  STATUS_META,
  addDaysStr,
  effectiveStatus,
  todayInTz,
  weekdayOf,
} from "@/lib/services/attendance.service";

/**
 * GET /api/attendance/me — employee self-service snapshot (M4):
 *  - today: aaj ka record (+ server date in company tz)
 *  - office: geofence/settings info (UI hint ke liye)
 *  - month: { from, to, days: [{ date, status, check_in, check_out, worked_minutes }] }
 *    — calendar grid + month stats isi se banti hain
 *  - stats: month-to-date counts + total hours + avg check-in
 *  - corrections: { pendingCount } + apni recent requests
 */

export const GET = apiHandler(async () => {
  const { supabase, profile } = await requireAuth();

  // Staff w/o employee link ke liye bhi today/tz chahiye (board date defaults)
  const { data: settingsRow } = await supabase
    .from("hcm_company_settings")
    .select("timezone")
    .eq("id", 1)
    .maybeSingle();
  const tzFallback = settingsRow?.timezone ?? "Asia/Karachi";

  if (!profile.employee_id) {
    return NextResponse.json({
      ok: true,
      data: { linked: false, today: todayInTz(tzFallback), timezone: tzFallback },
    });
  }

  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("office_start, grace_minutes, half_day_hours, weekend_days, office_lat, office_lng, radius_m, timezone")
    .eq("id", 1)
    .maybeSingle();

  const tz = settings?.timezone ?? "Asia/Karachi";
  const weekendDays = settings?.weekend_days ?? [0, 6];
  const today = todayInTz(tz);
  const monthFrom = `${today.slice(0, 7)}-01`;
  const monthTo = today; // calendar current month tak hi (future = upcoming)

  // Parallel reads — records, month-window approved leaves, holidays, corrections
  const [attRes, leaveRes, holRes, corrRes] = await Promise.all([
    supabase
      .from("hcm_attendance")
      .select("id, date, check_in, check_out, status, source, worked_minutes")
      .eq("employee_id", profile.employee_id)
      .gte("date", monthFrom)
      .lte("date", monthTo)
      .order("date", { ascending: false }),
    supabase
      .from("hcm_leave_requests")
      .select("start_date, end_date")
      .eq("employee_id", profile.employee_id)
      .eq("status", "approved")
      .lte("start_date", monthTo)
      .gte("end_date", monthFrom),
    supabase.from("hcm_holidays").select("date, name").gte("date", monthFrom).lte("date", addDaysStr(monthFrom, 40)),
    supabase
      .from("hcm_attendance_corrections")
      .select("id, date, requested_check_in, requested_check_out, reason, status, decision_comment, created_at")
      .eq("employee_id", profile.employee_id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const attError = attRes.error || leaveRes.error || holRes.error || corrRes.error;
  if (attError) throw new ApiError(500, attError.message);

  const records = attRes.data ?? [];
  const recordByDate = new Map(records.map((r) => [r.date, r]));
  const holidayByDate = new Map((holRes.data ?? []).map((h) => [h.date, h.name]));

  const coversDate = (leave, dateStr) => leave.start_date <= dateStr && dateStr <= leave.end_date;

  // Calendar days — month ke pehle din se aaj tak
  const days = [];
  for (let d = monthFrom; d <= today; d = addDaysStr(d, 1)) {
    const record = recordByDate.get(d) ?? null;
    const leave = (leaveRes.data ?? []).find((l) => coversDate(l, d)) ?? null;
    days.push({
      date: d,
      status: effectiveStatus({
        record,
        leave,
        isWeekend: weekendDays.includes(weekdayOf(d)),
        isHoliday: holidayByDate.has(d),
        relation: d < today ? "past" : "today",
      }),
      check_in: record?.check_in ?? null,
      check_out: record?.check_out ?? null,
      worked_minutes: record?.worked_minutes ?? null,
    });
  }

  // Stats — month to date
  const stats = { present: 0, late: 0, half_day: 0, absent: 0, on_leave: 0, weekend: 0, holiday: 0, missing_checkout: 0, total_minutes: 0, avg_check_in: null };
  let inSum = 0;
  let inCount = 0;
  for (const day of days) {
    if (day.status in stats) stats[day.status] += 1;
    if (day.status === "present" || day.status === "late" || day.status === "half_day") {
      stats.total_minutes += day.worked_minutes ?? 0;
      if (day.check_in) {
        const wall = new Intl.DateTimeFormat("en-GB", {
          timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(new Date(day.check_in));
        const [h, m] = wall.split(":").map(Number);
        inSum += h * 60 + m;
        inCount += 1;
      }
    }
  }
  if (inCount) {
    const avg = Math.round(inSum / inCount);
    stats.avg_check_in = `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`;
  }

  const todayRecord = recordByDate.get(today) ?? null;
  const pendingCount = (corrRes.data ?? []).filter((c) => c.status === "pending").length;

  return NextResponse.json({
    ok: true,
    data: {
      linked: true,
      employeeId: profile.employee_id,
      today,
      timezone: tz,
      office: {
        office_start: settings?.office_start ?? "09:00",
        grace_minutes: settings?.grace_minutes ?? 15,
        half_day_hours: settings?.half_day_hours ?? 5,
        weekend_days: weekendDays,
        office_lat: settings?.office_lat ?? null,
        office_lng: settings?.office_lng ?? null,
        radius_m: settings?.radius_m ?? null,
      },
      todayRecord,
      todayStatus: todayRecord
        ? effectiveStatus({
            record: todayRecord,
            leave: null,
            isWeekend: weekendDays.includes(weekdayOf(today)),
            isHoliday: holidayByDate.has(today),
            relation: "today",
          })
        : null,
      month: { from: monthFrom, days },
      stats,
      statusMeta: STATUS_META,
      corrections: corrRes.data ?? [],
      correctionsPending: pendingCount,
    },
  });
});
