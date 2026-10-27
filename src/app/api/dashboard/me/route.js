import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { todayInTz } from "@/lib/services/attendance.service";
import { addDays, attendanceRatePct, weekBounds } from "@/lib/services/dashboard.service";
import { computeBalances } from "@/lib/services/leave.service";
import { round2 } from "@/lib/services/payroll.service";

/**
 * GET /api/dashboard/me — Employee personal dashboard (M7, F18)
 *
 * Brief Section 7: check-in widget (client component, attendance/me se) ·
 * hours this week vs 40 h · late count · leave balance · last payslip.
 * Employee-scope only — koi doosre employee ka data nahi aata.
 * Unlinked staff logins: linked:false (UI staff dashboards use karte hain).
 */

export const GET = apiHandler(async () => {
  const { supabase, profile, employee } = await requireAuth();

  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("timezone, weekend_days")
    .eq("id", 1)
    .maybeSingle();
  const tz = settings?.timezone ?? "Asia/Karachi";
  const today = todayInTz(tz);

  const base = { today, tz };
  if (!employee) {
    return NextResponse.json({ ok: true, data: { linked: false, ...base } });
  }

  const week = weekBounds(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const yesterday = addDays(today, -1);
  const year = today.slice(0, 4);

  const [weekRes, monthRes, typesRes, reqRes, runRes, nextLeaveRes] = await Promise.all([
    supabase
      .from("hcm_attendance")
      .select("date, worked_minutes, status")
      .eq("employee_id", employee.id)
      .gte("date", week.from)
      .lte("date", week.to)
      .order("date"),
    supabase
      .from("hcm_attendance")
      .select("date, status")
      .eq("employee_id", employee.id)
      .gte("date", monthStart)
      .lte("date", today),
    supabase
      .from("hcm_leave_types")
      .select("id, code, name, yearly_quota, is_paid")
      .order("code"),
    supabase
      .from("hcm_leave_requests")
      .select("id, leave_type_id, start_date, end_date, days, status")
      .eq("employee_id", employee.id)
      .gte("start_date", `${year}-01-01`)
      .lte("start_date", `${year}-12-31`),
    // last finalized payslip
    supabase
      .from("hcm_payroll_items")
      .select("id, gross, net, deductions, tax, hcm_payroll_runs!inner ( month, status )")
      .eq("employee_id", employee.id)
      .eq("hcm_payroll_runs.status", "finalized")
      .order("id", { ascending: false })
      .limit(1),
    supabase
      .from("hcm_leave_requests")
      .select("id, start_date, end_date, days, status, hcm_leave_types:leave_type_id ( name, code )")
      .eq("employee_id", employee.id)
      .eq("status", "approved")
      .gte("start_date", today)
      .order("start_date")
      .limit(1),
  ]);

  const err = weekRes.error || monthRes.error || typesRes.error || reqRes.error || runRes.error || nextLeaveRes.error;
  if (err) throw new ApiError(500, err.message);

  // ---- Hours this week (target 40 h per brief) ----
  const weekRows = weekRes.data ?? [];
  const workedMinutes = weekRows.reduce(
    (s, r) => s + Number(r.worked_minutes ?? 0),
    0
  );
  const byDayMap = new Map(weekRows.map((r) => [r.date, Number(r.worked_minutes ?? 0)]));
  const byDay = [];
  {
    let cursor = week.from;
    for (let i = 0; i < 7; i += 1) {
      byDay.push({ date: cursor, minutes: byDayMap.get(cursor) ?? 0 });
      cursor = addDays(cursor, 1);
    }
  }

  // ---- This month: late count + attendance rate ----
  const monthRows = monthRes.data ?? [];
  const lateCount = monthRows.filter((r) => (r.status ?? "") === "late").length;
  const monthRate = attendanceRatePct({
    present: monthRows.filter((r) => (r.status ?? "") === "present").length,
    late: lateCount,
    half_day: monthRows.filter((r) => (r.status ?? "") === "half_day").length,
    missing_checkout: monthRows.filter((r) => (r.status ?? "") === "missing_checkout").length,
    // on-leave days is month me: approved leaves overlap — lightweight count
    on_leave: (reqRes.data ?? []).filter(
      (r) =>
        r.status === "approved" &&
        r.start_date <= today &&
        r.end_date >= monthStart
    ).length,
    workingDayRecords: monthRows.length + (reqRes.data ?? []).filter(
      (r) => r.status === "approved" && r.start_date <= today && r.end_date >= monthStart
    ).length,
  });

  // ---- Leave balances (Phase 5 ke computeBalances se — same numbers) ----
  const balances = computeBalances(typesRes.data ?? [], reqRes.data ?? [], Number(year));

  // ---- Last payslip + upcoming leave ----
  const payItem = (runRes.data ?? [])[0] ?? null;
  const lastPayslip = payItem
    ? {
        id: payItem.id,
        month: payItem.hcm_payroll_runs?.month ?? null,
        gross: round2(payItem.gross),
        net: round2(payItem.net),
        deductions: round2(payItem.deductions ?? 0),
        tax: round2(payItem.tax ?? 0),
      }
    : null;

  const nextLeaveRow = (nextLeaveRes.data ?? [])[0] ?? null;
  const nextLeave = nextLeaveRow
    ? {
        id: nextLeaveRow.id,
        start: nextLeaveRow.start_date,
        end: nextLeaveRow.end_date,
        days: nextLeaveRow.days,
        typeName: nextLeaveRow.hcm_leave_types?.name ?? null,
      }
    : null;

  return NextResponse.json({
    ok: true,
    data: {
      linked: true,
      ...base,
      employee: {
        id: employee.id,
        code: employee.code,
        fullName: employee.full_name,
        joinDate: employee.join_date,
      },
      week: {
        from: week.from,
        to: week.to,
        workedMinutes,
        targetMinutes: 40 * 60,
        byDay,
      },
      lateCount,
      monthRate,
      balances,
      lastPayslip,
      nextLeave,
      pendingLeave: (reqRes.data ?? []).filter((r) => r.status === "pending").length,
    },
  });
});
