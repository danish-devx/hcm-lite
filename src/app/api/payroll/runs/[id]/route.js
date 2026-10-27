import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";
import { latePenaltyDaysOf, monthBounds, workingDayLateCount } from "@/lib/services/payroll.service";

/**
 * GET    /api/payroll/runs/[id] — staff: run + items (employee joins) + totals
 * DELETE /api/payroll/runs/[id] — staff: delete a DRAFT run (finalized 409)
 */

const ITEM_SELECT = `
  id, run_id, employee_id, basic, gross, working_days, payable_days,
  absent_days, unpaid_days, half_days, deductions, tax, net
`;

async function loadRun(supabase, id) {
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) {
    throw new ApiError(404, "Payroll run not found.");
  }
  const { data: run, error } = await supabase
    .from("hcm_payroll_runs")
    .select("id, month, status, created_by, finalized_by, finalized_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!run) throw new ApiError(404, "Payroll run not found.");
  return run;
}

export const GET = apiHandler(async (request, context) => {
  const { id } = await context.params;
  const { supabase, profile } = await requireAuth();
  if (profile.role !== "admin" && profile.role !== "hr") {
    throw new ApiError(403, "Payroll runs are staff-only. Use /api/payroll/me.");
  }

  const run = await loadRun(supabase, id);

  const { data: items, error: itErr } = await supabase
    .from("hcm_payroll_items")
    .select(ITEM_SELECT)
    .eq("run_id", id)
    .order("net", { ascending: false });
  if (itErr) throw new ApiError(500, itErr.message);

  // Employee + department/designation names (FK-name-safe: 2-step)
  const empIds = [...new Set((items ?? []).map((i) => i.employee_id))];
  const empById = new Map();
  if (empIds.length > 0) {
    const { data: emps } = await supabase
      .from("hcm_employees")
      .select("id, code, full_name, department_id, designation_id, join_date, exit_date, status")
      .in("id", empIds);
    const deptIds = [...new Set((emps ?? []).map((e) => e.department_id).filter(Boolean))];
    const desigIds = [...new Set((emps ?? []).map((e) => e.designation_id).filter(Boolean))];
    const [deptsRes, desigsRes] = await Promise.all([
      deptIds.length
        ? supabase.from("hcm_departments").select("id, name").in("id", deptIds)
        : Promise.resolve({ data: [] }),
      desigIds.length
        ? supabase.from("hcm_designations").select("id, name").in("id", desigIds)
        : Promise.resolve({ data: [] }),
    ]);
    const deptName = new Map((deptsRes.data ?? []).map((d) => [d.id, d.name]));
    const desigName = new Map((desigsRes.data ?? []).map((d) => [d.id, d.name]));
    for (const e of emps ?? []) {
      empById.set(e.id, {
        id: e.id,
        code: e.code,
        fullName: e.full_name,
        status: e.status,
        department: e.department_id ? deptName.get(e.department_id) ?? null : null,
        designation: e.designation_id ? desigName.get(e.designation_id) ?? null : null,
      });
    }
  }

  // Actor names
  const actorIds = [run.created_by, run.finalized_by].filter(Boolean);
  const nameById = new Map();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("hcm_profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of profiles ?? []) nameById.set(p.id, p.full_name);
  }

  // ---- Late info (bonus rule "3 lates = 0.5 day") — month attendance se ----
  // Read-time derivation: stored deductions me penalty ALREADY folded hai
  // (compute time); yahan sirf display ke liye late count nikalte hain —
  // working days par hi (weekend/holiday lates compute me bhi skip hote hain).
  const { start, end } = monthBounds(run.month);
  let lateByEmp = new Map();
  if (empIds.length > 0) {
    const [settingsRes, holRes, lateRes] = await Promise.all([
      supabase.from("hcm_company_settings").select("weekend_days").eq("id", 1).maybeSingle(),
      supabase.from("hcm_holidays").select("date").gte("date", start).lte("date", end),
      supabase
        .from("hcm_attendance")
        .select("employee_id, date, status")
        .in("employee_id", empIds)
        .eq("status", "late")
        .gte("date", start)
        .lte("date", end),
    ]);
    if (settingsRes.error || holRes.error || lateRes.error) {
      throw new ApiError(500, (settingsRes.error || holRes.error || lateRes.error).message);
    }
    const ctx = {
      weekendDays: settingsRes.data?.weekend_days ?? [0, 6],
      holidaySet: new Set((holRes.data ?? []).map((h) => h.date)),
    };
    const lateRowsByEmp = new Map();
    for (const r of lateRes.data ?? []) {
      (lateRowsByEmp.get(r.employee_id) ?? lateRowsByEmp.set(r.employee_id, []).get(r.employee_id)).push(r);
    }
    for (const [empId, rows] of lateRowsByEmp) {
      lateByEmp.set(empId, workingDayLateCount(rows, ctx));
    }
  }

  const totals = (items ?? []).reduce(
    (t, it) => ({
      employees: t.employees + 1,
      gross: t.gross + Number(it.gross ?? 0),
      deductions: t.deductions + Number(it.deductions ?? 0),
      tax: t.tax + Number(it.tax ?? 0),
      net: t.net + Number(it.net ?? 0),
    }),
    { employees: 0, gross: 0, deductions: 0, tax: 0, net: 0 }
  );

  return NextResponse.json({
    ok: true,
    data: {
      run: {
        ...run,
        createdByName: nameById.get(run.created_by) ?? null,
        finalizedByName: nameById.get(run.finalized_by) ?? null,
      },
      items: (items ?? []).map((it) => {
        const lateDays = lateByEmp.get(it.employee_id) ?? 0;
        return {
          ...it,
          employee: empById.get(it.employee_id) ?? null,
          lateDays,
          latePenaltyDays: latePenaltyDaysOf(lateDays),
        };
      }),
      totals,
    },
  });
});

export const DELETE = apiHandler(async (request, context) => {
  const { id } = await context.params;
  const { supabase, admin, profile } = await requireAuth(["admin", "hr"]);

  const run = await loadRun(supabase, id);
  if (run.status === "finalized") {
    throw new ApiError(409, "Finalized runs are locked — draft runs only.");
  }

  // hcm_payroll_runs par delete RLS policy nahi hai (phase0 schema) —
  // privileged delete service_role se, RBAC upar code me enforce ho chuka.
  const { error: delItemsErr } = await admin
    .from("hcm_payroll_items")
    .delete()
    .eq("run_id", id);
  if (delItemsErr) throw new ApiError(500, delItemsErr.message);

  const { error: delRunErr } = await admin
    .from("hcm_payroll_runs")
    .delete()
    .eq("id", id);
  if (delRunErr) throw new ApiError(500, delRunErr.message);

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: "payroll.run_delete",
    entity: "hcm_payroll_runs",
    entityId: id,
    before: { month: run.month, status: run.status },
  });

  return NextResponse.json({ ok: true, data: { deleted: id } });
});
