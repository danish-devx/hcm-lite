import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { todayInTz } from "@/lib/services/attendance.service";
import {
  addDays,
  attritionPct,
  attritionRiskOf,
  genderSplitOf,
  mean,
  pct,
  resolveRange,
  tenureBuckets,
  tenureYears,
} from "@/lib/services/dashboard.service";
import { round2 } from "@/lib/services/payroll.service";

/**
 * GET /api/dashboard/admin?from&to&department — Admin company dashboard (M7, F18)
 *
 * Brief Section 7: headcount · attrition YTD · payroll cost · avg salary ·
 * headcount by dept · payroll cost by dept · gender and tenure · audit feed.
 * Sab numbers SERVER par compute hote hain; date range + department filter.
 * HR/Employee: 403 (admin-only view).
 */

export const GET = apiHandler(async (request) => {
  const { supabase, profile } = await requireAuth(["admin"]);

  const params = new URL(request.url).searchParams;
  const departmentFilter = params.get("department") || null;

  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("timezone, weekend_days")
    .eq("id", 1)
    .maybeSingle();
  const tz = settings?.timezone ?? "Asia/Karachi";
  const weekendDays = new Set((settings?.weekend_days ?? [0, 6]).map(Number));
  const today = todayInTz(tz);
  const { from, to } = resolveRange({
    from: params.get("from"),
    to: params.get("to"),
    today,
  });

  const window30From = addDays(today, -29);
  const window90From = addDays(today, -89);

  const [empRes, deptRes, desigRes, runRes, auditRes, att30Res, hol30Res, unpaidRes, leave30Res, typeRes] = await Promise.all([
    supabase
      .from("hcm_employees")
      .select(
        "id, code, full_name, gender, department_id, designation_id, join_date, exit_date, status, basic_salary"
      ),
    supabase.from("hcm_departments").select("id, name"),
    supabase.from("hcm_designations").select("id, name, department_id"),
    // finalized runs within range months — payroll cost source of truth
    supabase
      .from("hcm_payroll_runs")
      .select("id, month, status, hcm_payroll_items ( employee_id, basic, gross, net )")
      .eq("status", "finalized")
      .gte("month", from.slice(0, 7))
      .lte("month", to.slice(0, 7)),
    supabase
      .from("hcm_audit_logs")
      .select("id, action, entity, actor_role, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    // Attrition-risk signals (bonus): last 30d attendance + holidays + leaves
    supabase
      .from("hcm_attendance")
      .select("employee_id, date, status")
      .gte("date", window30From)
      .lte("date", today),
    supabase.from("hcm_holidays").select("date").gte("date", window30From).lte("date", today),
    // 90d unpaid signal + 30d leave cover (koi bhi approved leave — absent nahi ginta)
    supabase
      .from("hcm_leave_requests")
      .select("employee_id, days, leave_type_id, end_date")
      .eq("status", "approved")
      .gte("end_date", window90From)
      .lte("end_date", today),
    supabase
      .from("hcm_leave_requests")
      .select("employee_id, start_date, end_date")
      .eq("status", "approved")
      .gte("end_date", window30From)
      .lte("start_date", today),
    supabase.from("hcm_leave_types").select("id, is_paid"),
  ]);

  const err =
    empRes.error || deptRes.error || desigRes.error || runRes.error || auditRes.error || att30Res.error ||
    hol30Res.error || unpaidRes.error || leave30Res.error || typeRes.error;
  if (err) throw new ApiError(500, err.message);

  const deptName = new Map((deptRes.data ?? []).map((d) => [d.id, d.name]));
  const desigName = new Map((desigRes.data ?? []).map((d) => [d.id, d.name]));

  const allEmployees = empRes.data ?? [];
  const scoped = departmentFilter
    ? allEmployees.filter((e) => e.department_id === departmentFilter)
    : allEmployees;

  const isActiveOn = (e, date) =>
    e.status === "active" &&
    e.join_date <= date &&
    (!e.exit_date || e.exit_date > date);

  const active = scoped.filter((e) => isActiveOn(e, today));
  const activeAtFrom = scoped.filter((e) => isActiveOn(e, from));
  const exitsInPeriod = scoped.filter(
    (e) => e.exit_date && e.exit_date >= from && e.exit_date <= to
  ).length;

  // ---- Payroll aggregation (finalized only) ----
  const payrollByDept = new Map(); // name → {gross, net}
  const payrollByMonth = new Map(); // YYYY-MM → {gross, net}
  let payrollCost = 0;
  for (const run of runRes.data ?? []) {
    for (const item of run.hcm_payroll_items ?? []) {
      const emp = allEmployees.find((e) => e.id === item.employee_id);
      if (!emp) continue;
      if (departmentFilter && emp.department_id !== departmentFilter) continue;
      const name = emp.department_id
        ? (deptName.get(emp.department_id) ?? "Unassigned")
        : "Unassigned";
      const dEntry = payrollByDept.get(name) ?? { gross: 0, net: 0 };
      dEntry.gross += Number(item.gross ?? 0);
      dEntry.net += Number(item.net ?? 0);
      payrollByDept.set(name, dEntry);
      const mEntry = payrollByMonth.get(run.month) ?? { gross: 0, net: 0 };
      mEntry.gross += Number(item.gross ?? 0);
      mEntry.net += Number(item.net ?? 0);
      payrollByMonth.set(run.month, mEntry);
      payrollCost += Number(item.net ?? 0);
    }
  }

  // ---- Averages (brief: mean gross by department and designation) ----
  const grossOf = (e) => Number(e.basic_salary ?? 0) * 1.5; // payroll convention
  const avgSalaryGross = mean(active.map(grossOf));
  const byDesig = new Map(); // name → [gross...]
  for (const e of active) {
    const name = e.designation_id
      ? (desigName.get(e.designation_id) ?? "Unassigned")
      : "Unassigned";
    if (!byDesig.has(name)) byDesig.set(name, []);
    byDesig.get(name).push(grossOf(e));
  }

  // ---- Groupings ----
  const groupCount = (list, keyFn) => {
    const map = new Map();
    for (const e of list) {
      const k = keyFn(e) ?? "Unassigned";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  };

  const headcountByDept = groupCount(active, (e) =>
    e.department_id ? (deptName.get(e.department_id) ?? "Unassigned") : "Unassigned"
  );
  const avgSalaryByDesignation = [...byDesig.entries()]
    .map(([name, list]) => ({ name, count: list.length, avgGross: mean(list) }))
    .sort((a, b) => b.avgGross - a.avgGross)
    .slice(0, 6);

  // ---- Attrition risk (bonus) — 30d attendance + 90d unpaid leaves + tenure/salary ----
  const holiday30 = new Set((hol30Res.data ?? []).map((h) => h.date));
  const unpaidTypeIds = new Set(
    (typeRes.data ?? []).filter((t) => !t.is_paid).map((t) => t.id)
  );
  const unpaidDaysByEmp = new Map();
  for (const l of unpaidRes.data ?? []) {
    if (!unpaidTypeIds.has(l.leave_type_id)) continue;
    unpaidDaysByEmp.set(l.employee_id, (unpaidDaysByEmp.get(l.employee_id) ?? 0) + Number(l.days ?? 0));
  }

  // Leave cover map — approved leave ka din ABSENT nahi (paid/unpaid dono)
  const leaveCoverByEmp = new Map(); // empId → [{start, end}]
  for (const l of leave30Res.data ?? []) {
    if (!leaveCoverByEmp.has(l.employee_id)) leaveCoverByEmp.set(l.employee_id, []);
    leaveCoverByEmp.get(l.employee_id).push({ start: l.start_date, end: l.end_date });
  }
  const isLeaveCovered = (empId, d) =>
    (leaveCoverByEmp.get(empId) ?? []).some((c) => c.start <= d && d <= c.end);

  const isWorkingDay30 = (d) =>
    !weekendDays.has(new Date(`${d}T00:00:00Z`).getUTCDay()) && !holiday30.has(d);

  // 30d expected working days + late/missing counts per employee (join-clipped)
  const riskByEmp = new Map(); // empId → {expected, absent, late, missing}
  for (let i = 0; i < 31; i += 1) {
    const d = addDays(window30From, i);
    if (d > today) break;
    if (!isWorkingDay30(d)) continue;
    for (const e of active) {
      if (e.join_date > d) continue;
      const entry = riskByEmp.get(e.id) ?? { expected: 0, absent: 0, late: 0, missing: 0 };
      entry.expected += 1;
      riskByEmp.set(e.id, entry);
    }
  }
  const riskRecordsByEmp = new Map(); // empId → Set(dates with a record)
  for (const r of att30Res.data ?? []) {
    if (!riskRecordsByEmp.has(r.employee_id)) riskRecordsByEmp.set(r.employee_id, new Set());
    riskRecordsByEmp.get(r.employee_id).add(r.date);
    const entry = riskByEmp.get(r.employee_id);
    if (!entry) continue;
    if ((r.status ?? "") === "late") entry.late += 1;
    if ((r.status ?? "") === "missing_checkout") entry.missing += 1;
  }

  let companyAbsentDays30 = 0;
  let companyExpectedDays30 = 0;
  for (const e of active) {
    const entry = riskByEmp.get(e.id) ?? { expected: 0, absent: 0, late: 0, missing: 0 };
    const recs = riskRecordsByEmp.get(e.id) ?? new Set();
    for (let i = 0; i < 31; i += 1) {
      const d = addDays(window30From, i);
      if (d > today || d < e.join_date) continue;
      if (!isWorkingDay30(d)) continue;
      if (!recs.has(d) && !isLeaveCovered(e.id, d)) entry.absent += 1;
    }
    companyAbsentDays30 += entry.absent;
    companyExpectedDays30 += entry.expected;
  }
  const companyAbsencePct30d = pct(companyAbsentDays30, companyExpectedDays30);

  const deptAvgGrossMap = new Map();
  for (const e of active) {
    const key = e.department_id ?? "none";
    if (!deptAvgGrossMap.has(key)) deptAvgGrossMap.set(key, []);
    deptAvgGrossMap.get(key).push(grossOf(e));
  }

  const attritionRiskList = active
    .map((e) => {
      const s = riskByEmp.get(e.id) ?? { expected: 0, absent: 0, late: 0, missing: 0 };
      const deptKey = e.department_id ?? "none";
      const deptAvg = mean(deptAvgGrossMap.get(deptKey) ?? []);
      const risk = attritionRiskOf({
        tenureYrs: tenureYears(e.join_date, today),
        salaryGross: grossOf(e),
        deptAvgGross: deptAvg,
        absencePct30d: pct(s.absent, s.expected),
        companyAbsencePct30d,
        lates30d: s.late,
        unpaidDays90d: unpaidDaysByEmp.get(e.id) ?? 0,
        missingCheckouts30d: s.missing,
      });
      return {
        id: e.id,
        name: e.full_name,
        code: e.code,
        dept: e.department_id ? (deptName.get(e.department_id) ?? "Unassigned") : "Unassigned",
        ...risk,
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return NextResponse.json({
    ok: true,
    data: {
      range: { from, to },
      today,
      tz,
      kpis: {
        headcount: active.length,
        exits: exitsInPeriod,
        attritionPct: attritionPct({
          exitsInPeriod,
          headcountStart: activeAtFrom.length,
          headcountEnd: active.length,
        }),
        payrollCost: round2(payrollCost),
        payrollMonths: payrollByMonth.size,
        avgSalaryGross: round2(avgSalaryGross),
      },
      headcountByDept,
      payrollByDept: [...payrollByDept.entries()]
        .map(([name, v]) => ({ name, gross: round2(v.gross), net: round2(v.net) }))
        .sort((a, b) => b.net - a.net),
      payrollTrend: [...payrollByMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, gross: round2(v.gross), net: round2(v.net) })),
      gender: genderSplitOf(active),
      tenure: tenureBuckets(active.map((e) => tenureYears(e.join_date, today))),
      avgSalaryByDesignation,
      attritionRisk: {
        companyAbsencePct30d,
        highCount: attritionRiskList.filter((r) => r.level === "high").length,
        mediumCount: attritionRiskList.filter((r) => r.level === "medium").length,
        top: attritionRiskList.slice(0, 8),
      },
      auditFeed: (auditRes.data ?? []).map((a) => ({
        id: a.id,
        action: a.action,
        entity: a.entity,
        actorRole: a.actor_role,
        createdAt: a.created_at,
      })),
    },
  });
});
