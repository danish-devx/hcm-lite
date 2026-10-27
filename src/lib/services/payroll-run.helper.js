import { ApiError } from "@/lib/guards";
import { todayInTz } from "@/lib/services/attendance.service";
import {
  computeEmployeeItem,
  monthBounds,
  MONTH_RE,
} from "@/lib/services/payroll.service";

/**
 * Payroll run compute helper — create aur recalculate dono routes isi se
 * items banate hain, taake dono ka math 1:1 same rahe.
 *
 * Returns { items, skipped, meta } — items DB-ready rows (run_id/employee_id
 * caller jodta hai), skipped = [{ code, name, reason }].
 */
export async function computeRunItems(supabase, month) {
  if (!MONTH_RE.test(month ?? "")) {
    throw new ApiError(422, "Month must be in YYYY-MM format.");
  }

  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("company_name, timezone, weekend_days")
    .eq("id", 1)
    .maybeSingle();
  const tz = settings?.timezone ?? "Asia/Karachi";
  const weekendDays = settings?.weekend_days ?? [0, 6];
  const todayStr = todayInTz(tz);

  if (month > todayStr.slice(0, 7)) {
    throw new ApiError(422, "Payroll cannot be run for a future month.");
  }

  const { start, end } = monthBounds(month);

  // ---- In-scope employees: join month ke andar, exit month se pehle nahi ----
  const { data: employees, error: empErr } = await supabase
    .from("hcm_employees")
    .select(
      "id, code, full_name, basic_salary, join_date, exit_date, status, department_id, designation_id"
    )
    .lte("join_date", end)
    .or(`exit_date.is.null,exit_date.gte.${start}`)
    .order("full_name");
  if (empErr) throw new ApiError(500, empErr.message);

  const eligible = (employees ?? []).filter((e) => Number(e.basic_salary ?? 0) > 0);
  const skipped = (employees ?? [])
    .filter((e) => !(Number(e.basic_salary ?? 0) > 0))
    .map((e) => ({
      code: e.code,
      name: e.full_name,
      reason: "No basic salary set — set salary first, then recalculate.",
    }));

  if (eligible.length === 0) {
    throw new ApiError(
      422,
      skipped.length > 0
        ? "No employees with a basic salary in scope for this month."
        : "No employees fall inside this month (join/exit dates)."
    );
  }

  const ids = eligible.map((e) => e.id);

  // ---- Attendance records (month window) ----
  const { data: attendance, error: attErr } = await supabase
    .from("hcm_attendance")
    .select("employee_id, date, status")
    .in("employee_id", ids)
    .gte("date", start)
    .lte("date", end);
  if (attErr) throw new ApiError(500, attErr.message);

  // ---- Approved leaves overlapping the month (+ paid flag from type) ----
  const { data: leaves, error: lvErr } = await supabase
    .from("hcm_leave_requests")
    .select("employee_id, start_date, end_date, leave_type_id")
    .eq("status", "approved")
    .in("employee_id", ids)
    .gte("end_date", start)
    .lte("start_date", end);
  if (lvErr) throw new ApiError(500, lvErr.message);

  const { data: leaveTypes } = await supabase
    .from("hcm_leave_types")
    .select("id, is_paid");
  const paidByType = new Set(
    (leaveTypes ?? []).filter((t) => t.is_paid).map((t) => t.id)
  );
  const shapedLeaves = (leaves ?? []).map((l) => ({
    start_date: l.start_date,
    end_date: l.end_date,
    paid: paidByType.has(l.leave_type_id),
  }));

  // ---- Holidays in month ----
  const { data: holidays, error: holErr } = await supabase
    .from("hcm_holidays")
    .select("date")
    .gte("date", start)
    .lte("date", end);
  if (holErr) throw new ApiError(500, holErr.message);
  const holidaySet = new Set((holidays ?? []).map((h) => h.date));

  // ---- Group by employee ----
  const attByEmp = {};
  for (const r of attendance ?? []) {
    (attByEmp[r.employee_id] ??= []).push(r);
  }
  const lvByEmp = {};
  for (const l of shapedLeaves) {
    (lvByEmp[l.employee_id] ??= []).push(l);
  }

  const items = eligible.map((emp) => ({
    employee_id: emp.id,
    ...computeEmployeeItem({
      employee: emp,
      month,
      attendanceRows: attByEmp[emp.id] ?? [],
      approvedLeaves: lvByEmp[emp.id] ?? [],
      weekendDays,
      holidaySet,
      todayStr,
    }),
  }));

  return {
    items,
    skipped,
    meta: { companyName: settings?.company_name ?? "Company", timezone: tz, today: todayStr },
  };
}
