import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { todayInTz, wallParts } from "@/lib/services/attendance.service";
import {
  absenceAnomalyFlags,
  addDays,
  attendanceRatePct,
  attendanceTrendSeries,
  hhmm,
  pct,
  resolveRange,
} from "@/lib/services/dashboard.service";
import { workingDaysOf } from "@/lib/services/leave.service";

/**
 * GET /api/dashboard/hr?from&to&department — HR insights dashboard (M7, F18)
 *
 * Brief Section 7: headcount, present, on leave, late today, pending approvals ·
 * attendance trend · absenteeism by dept · leave by type · top 5 late-comers.
 * Attendance rate formula: (present + late + missing_checkout + 0.5 × half_day)
 * ÷ (working-day records − on_leave). Employee: 403.
 */

export const GET = apiHandler(async (request) => {
  const { supabase, profile } = await requireAuth(["admin", "hr"]);

  const params = new URL(request.url).searchParams;
  const departmentFilter = params.get("department") || null;

  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("timezone, weekend_days")
    .eq("id", 1)
    .maybeSingle();
  const tz = settings?.timezone ?? "Asia/Karachi";
  const weekendDays = settings?.weekend_days ?? [0, 6];
  const today = todayInTz(tz);
  const { from, to } = resolveRange({
    from: params.get("from"),
    to: params.get("to"),
    today,
  });
  const windowTo = to < today ? to : today; // attendance future me nahi hoti

  const [empRes, deptRes, attRes, leaveRes, typeRes, holRes, corrRes] = await Promise.all([
    supabase
      .from("hcm_employees")
      .select("id, code, full_name, department_id, join_date, exit_date, status"),
    supabase.from("hcm_departments").select("id, name"),
    supabase
      .from("hcm_attendance")
      .select("employee_id, date, check_in, status, worked_minutes")
      .gte("date", from)
      .lte("date", windowTo),
    supabase
      .from("hcm_leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, days, status")
      .in("status", ["pending", "approved"])
      .lte("start_date", windowTo)
      .gte("end_date", from),
    supabase.from("hcm_leave_types").select("id, code, name, yearly_quota"),
    supabase
      .from("hcm_holidays")
      .select("date")
      .gte("date", from)
      .lte("date", windowTo),
    supabase
      .from("hcm_attendance_corrections")
      .select("id, employee_id, status")
      .eq("status", "pending"),
  ]);

  const err =
    empRes.error || deptRes.error || attRes.error || leaveRes.error || typeRes.error || holRes.error || corrRes.error;
  if (err) throw new ApiError(500, err.message);

  const deptName = new Map((deptRes.data ?? []).map((d) => [d.id, d.name]));
  const allEmployees = empRes.data ?? [];
  const scoped = departmentFilter
    ? allEmployees.filter((e) => e.department_id === departmentFilter)
    : allEmployees;
  const scopedIds = new Set(scoped.map((e) => e.id));
  const empById = new Map(allEmployees.map((e) => [e.id, e]));
  const deptOf = (employeeId) => {
    const e = empById.get(employeeId);
    return e?.department_id ? (deptName.get(e.department_id) ?? "Unassigned") : "Unassigned";
  };

  const isActiveOn = (e, date) =>
    e.status === "active" && e.join_date <= date && (!e.exit_date || e.exit_date > date);

  // ---- Non-working days set (weekends + holidays over the window) ----
  const nonWorking = new Set((holRes.data ?? []).map((h) => h.date));
  {
    let cursor = from;
    for (let i = 0; i < 370 && cursor <= windowTo; i += 1) {
      if (weekendDays.map(Number).includes(new Date(`${cursor}T00:00:00Z`).getUTCDay())) {
        nonWorking.add(cursor);
      }
      cursor = addDays(cursor, 1);
    }
  }

  // ---- Indexes ----
  const recordsByDate = new Map(); // date → rows (scoped employees only)
  for (const r of attRes.data ?? []) {
    if (!scopedIds.has(r.employee_id)) continue;
    if (!recordsByDate.has(r.date)) recordsByDate.set(r.date, []);
    recordsByDate.get(r.date).push(r);
  }
  const leaveByDate = new Map(); // date → scoped on-leave count
  const leaveByType = new Map(); // typeId → {approved, pending}
  let pendingLeaveCount = 0;
  let onLeaveToday = 0;
  for (const l of leaveRes.data ?? []) {
    if (!scopedIds.has(l.employee_id)) continue;
    if (l.status === "pending") {
      pendingLeaveCount += 1;
      const entry = leaveByType.get(l.leave_type_id) ?? { approved: 0, pending: 0 };
      entry.pending += Number(l.days ?? 0);
      leaveByType.set(l.leave_type_id, entry);
      continue; // trend par sirf approved leave dikhta hai
    }
    let cursor = l.start_date > from ? l.start_date : from;
    const end = l.end_date < windowTo ? l.end_date : windowTo;
    for (let i = 0; i < 370 && cursor <= end; i += 1) {
      if (!nonWorking.has(cursor)) {
        leaveByDate.set(cursor, (leaveByDate.get(cursor) ?? 0) + 1);
        if (cursor === today) onLeaveToday += 1;
      }
      cursor = addDays(cursor, 1);
    }
    const entry = leaveByType.get(l.leave_type_id) ?? { approved: 0, pending: 0 };
    entry.approved += Number(l.days ?? 0);
    leaveByType.set(l.leave_type_id, entry);
  }

  // Expected headcount per date (join/exit clipped) — trend + absenteeism denominator
  const expectedByDate = new Map();
  {
    let cursor = from;
    for (let i = 0; i < 370 && cursor <= windowTo; i += 1) {
      if (!nonWorking.has(cursor)) {
        expectedByDate.set(
          cursor,
          scoped.filter((e) => isActiveOn(e, cursor)).length
        );
      }
      cursor = addDays(cursor, 1);
    }
  }

  // ---- Today KPIs ----
  const todayRecords = recordsByDate.get(today) ?? [];
  const presentToday = todayRecords.filter((r) =>
    ["present", "late", "half_day", "missing_checkout"].includes(r.status ?? "present")
  ).length;
  const lateToday = todayRecords.filter((r) => (r.status ?? "") === "late").length;
  const isTodayWorking = !nonWorking.has(today);
  const headcount = scoped.filter((e) => isActiveOn(e, today)).length;

  // ---- Trend + range totals ----
  const trend = attendanceTrendSeries({
    from,
    to: windowTo,
    today,
    recordsByDate,
    leaveByDate,
    expectedByDate,
    nonWorking,
  });
  const totals = trend.reduce(
    (acc, d) => ({
      present: acc.present + d.present,
      late: acc.late + d.late,
      half_day: acc.half_day + d.half_day,
      missing_checkout: acc.missing_checkout + d.missing_checkout,
      absent: acc.absent + d.absent,
      on_leave: acc.on_leave + d.on_leave,
      headcountDays: acc.headcountDays + d.headcount,
    }),
    {
      present: 0,
      late: 0,
      half_day: 0,
      missing_checkout: 0,
      absent: 0,
      on_leave: 0,
      headcountDays: 0,
    }
  );
  const rangeRate = attendanceRatePct({ ...totals, workingDayRecords: totals.headcountDays });

  // ---- Absenteeism by department (brief: late ÷ (present+late); absent ÷ expected) ----
  const perDept = new Map(); // name → accumulators
  const bump = (name, key, n = 1) => {
    const entry =
      perDept.get(name) ?? {
        name,
        present: 0,
        late: 0,
        absent: 0,
        expectedDays: 0,
      };
    entry[key] += n;
    perDept.set(name, entry);
  };
  for (const d of trend) {
    // present-day credit to each dept via records; absent via expected
    const records = recordsByDate.get(d.date) ?? [];
    for (const r of records) {
      const s = r.status ?? "present";
      if (s === "late") bump(deptOf(r.employee_id), "late");
      else if (["present", "half_day", "missing_checkout"].includes(s)) {
        bump(deptOf(r.employee_id), "present");
      }
    }
    const absentCount = d.absent;
    if (absentCount > 0) {
      // distribute absent across depts by expected headcount share
      const byDeptExpected = new Map();
      for (const e of scoped) {
        if (isActiveOn(e, d.date)) {
          const name = e.department_id
            ? (deptName.get(e.department_id) ?? "Unassigned")
            : "Unassigned";
          byDeptExpected.set(name, (byDeptExpected.get(name) ?? 0) + 1);
        }
      }
      for (const [name, share] of byDeptExpected) {
        if (d.headcount > 0) bump(name, "absent", (absentCount * share) / d.headcount);
      }
    }
  }
  // expected working days per dept (join/exit clipped, working days only)
  for (const e of scoped) {
    const start = e.join_date > from ? e.join_date : from;
    const end = e.exit_date && e.exit_date < windowTo ? e.exit_date : windowTo;
    const days = workingDaysOf(start, end < start ? start : end, weekendDays, nonWorking).length;
    const name = e.department_id
      ? (deptName.get(e.department_id) ?? "Unassigned")
      : "Unassigned";
    const entry =
      perDept.get(name) ?? { name, present: 0, late: 0, absent: 0, expectedDays: 0 };
    entry.expectedDays += days;
    perDept.set(name, entry);
  }
  const absenteeismByDept = [...perDept.values()]
    .map((d) => ({
      name: d.name,
      present: Math.round(d.present),
      late: Math.round(d.late),
      absent: Math.round(d.absent * 10) / 10,
      expectedDays: d.expectedDays,
      latePct: pct(d.late, d.present + d.late),
      absentPct: pct(d.absent, d.expectedDays),
    }))
    .sort((a, b) => b.absentPct - a.absentPct || b.latePct - a.latePct);

  // ---- Leave by type (brief: approved days ÷ quota, per type) ----
  const typeById = new Map((typeRes.data ?? []).map((t) => [t.id, t]));
  const activeCount = Math.max(1, headcount);
  const leaveTypes = (typeRes.data ?? []).map((t) => {
    const usage = leaveByType.get(t.id) ?? { approved: 0, pending: 0 };
    const quotaTotal = t.yearly_quota == null ? null : Number(t.yearly_quota) * activeCount;
    return {
      code: t.code,
      name: t.name,
      approvedDays: usage.approved,
      pendingDays: usage.pending,
      quotaTotal,
      utilization: quotaTotal ? pct(usage.approved, quotaTotal) : null,
    };
  });

  // ---- Top late-comers (brief: top 5) ----
  const lateByEmp = new Map(); // employeeId → {count, minutes[]}
  for (const r of attRes.data ?? []) {
    if ((r.status ?? "") !== "late" || !scopedIds.has(r.employee_id)) continue;
    const entry = lateByEmp.get(r.employee_id) ?? { count: 0, minutes: [] };
    entry.count += 1;
    if (r.check_in) {
      const p = wallParts(new Date(r.check_in), tz);
      entry.minutes.push(p.hour * 60 + p.minute);
    }
    lateByEmp.set(r.employee_id, entry);
  }
  const topLateComers = [...lateByEmp.entries()]
    .map(([employeeId, v]) => {
      const avgMin = v.minutes.length
        ? Math.round(v.minutes.reduce((s, n) => s + n, 0) / v.minutes.length)
        : null;
      const avgCheckIn = avgMin == null
        ? null
        : `${String(Math.floor(avgMin / 60) % 24).padStart(2, "0")}:${String(avgMin % 60).padStart(2, "0")}`;
      const emp = empById.get(employeeId);
      return {
        employeeId,
        name: emp?.full_name ?? "—",
        code: emp?.code ?? "—",
        dept: deptOf(employeeId),
        lateCount: v.count,
        avgCheckIn: hhmm(avgCheckIn),
      };
    })
    .sort((a, b) => b.lateCount - a.lateCount || a.name.localeCompare(b.name))
    .slice(0, 5);

  // ---- Absence anomaly flags (bonus) — per-employee pattern checks ----
  const recordDatesByEmp = new Map(); // empId → Set(dates with a record)
  for (const r of attRes.data ?? []) {
    if (!recordDatesByEmp.has(r.employee_id)) recordDatesByEmp.set(r.employee_id, new Set());
    recordDatesByEmp.get(r.employee_id).add(r.date);
  }
  const leaveCoverByEmp = new Map(); // empId → [{start, end}] (approved only)
  for (const l of leaveRes.data ?? []) {
    if (l.status !== "approved") continue;
    if (!leaveCoverByEmp.has(l.employee_id)) leaveCoverByEmp.set(l.employee_id, []);
    leaveCoverByEmp.get(l.employee_id).push({ start: l.start_date, end: l.end_date });
  }
  const isCovered = (empId, d) =>
    (leaveCoverByEmp.get(empId) ?? []).some((c) => c.start <= d && d <= c.end);

  const anomalyRows = [];
  let companyAbsentDays = 0;
  let companyExpectedDays = 0;
  for (const e of scoped) {
    if (!isActiveOn(e, today)) continue;
    const start = e.join_date > from ? e.join_date : from;
    const end = e.exit_date && e.exit_date < windowTo ? e.exit_date : windowTo;
    if (end < start) continue;
    const recs = recordDatesByEmp.get(e.id) ?? new Set();
    const absentDates = [];
    let expectedDays = 0;
    let cursor = start;
    for (let i = 0; i < 370 && cursor <= end; i += 1) {
      if (!nonWorking.has(cursor)) {
        expectedDays += 1;
        if (cursor < today && !recs.has(cursor) && !isCovered(e.id, cursor)) {
          absentDates.push(cursor);
        }
      }
      cursor = addDays(cursor, 1);
    }
    companyAbsentDays += absentDates.length;
    companyExpectedDays += expectedDays;
    anomalyRows.push({ e, absentDates, expectedDays });
  }
  const companyAbsentPct = pct(companyAbsentDays, companyExpectedDays);
  const anomalies = anomalyRows
    .map(({ e, absentDates, expectedDays }) => {
      const { absentCount, absentPct, flags } = absenceAnomalyFlags({
        absentDates,
        expectedDays,
        companyAbsentPct,
        presenceCount: (recordDatesByEmp.get(e.id) ?? new Set()).size,
      });
      return {
        employeeId: e.id,
        name: e.full_name,
        code: e.code,
        dept: e.department_id ? (deptName.get(e.department_id) ?? "Unassigned") : "Unassigned",
        absentCount,
        absentPct,
        flags,
      };
    })
    .filter((a) => a.flags.length > 0)
    .sort((a, b) => b.absentPct - a.absentPct || a.name.localeCompare(b.name))
    .slice(0, 10);

  return NextResponse.json({
    ok: true,
    data: {
      range: { from, to },
      today,
      tz,
      isWorkingDayToday: isTodayWorking,
      kpis: {
        headcount,
        present: presentToday,
        onLeave: onLeaveToday,
        late: lateToday,
        notCheckedIn: isTodayWorking
          ? Math.max(0, headcount - presentToday - onLeaveToday)
          : 0,
        pendingApprovals: pendingLeaveCount + (corrRes.data ?? []).filter((c) => scopedIds.has(c.employee_id)).length,
        attendanceRate: rangeRate,
        latePct: pct(totals.late, totals.present + totals.late),
      },
      totals,
      trend,
      absenteeismByDept,
      leaveByType: leaveTypes,
      topLateComers,
      anomalies,
      anomalySummary: { companyAbsentPct, flagged: anomalies.length },
    },
  });
});
