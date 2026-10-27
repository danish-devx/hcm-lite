import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * GET   /api/employees/[id] — Employee 360 payload (admin + hr)
 *       employee + login status + attendance (30 din) + leave (current year)
 * PATCH /api/employees/[id] — update record (admin + hr); status toggle login bhi sync karta hai
 */

const EMPLOYEE_SELECT = `
  id, code, full_name, email, phone, address, gender, department_id, designation_id,
  join_date, exit_date, status, basic_salary, user_id, created_at, updated_at,
  hcm_departments:department_id ( name ),
  hcm_designations:designation_id ( name )
`;

const patchSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other", ""]).optional(),
  departmentId: z.string().uuid().optional().or(z.literal("")),
  designationId: z.string().uuid().optional().or(z.literal("")),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  exitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  basicSalary: z.coerce.number().min(0).max(100000000).optional(),
  status: z.enum(["active", "inactive", "exit"]).optional(),
});

/** "09:07:32.123+05:00" → minutes-of-day in company tz (avg check-in ke liye). */
function minutesOfDayInTz(date, tz) {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      timeZone: tz,
    });
    const parts = fmt.formatToParts(date);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return hour * 60 + minute;
  } catch {
    const d = new Date(date);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}

function minutesToLabel(mins) {
  if (mins === null || Number.isNaN(mins)) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const GET = apiHandler(async (_request, context) => {
  const { id } = await context.params;
  const { supabase } = await requireAuth(["admin", "hr"]);

  // --- Employee + org names ---
  const { data: employee, error } = await supabase
    .from("hcm_employees")
    .select(EMPLOYEE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!employee) throw new ApiError(404, "Employee not found.");

  const normalized = {
    ...employee,
    department_name: employee.hcm_departments?.name ?? null,
    designation_name: employee.hcm_designations?.name ?? null,
    hcm_departments: undefined,
    hcm_designations: undefined,
  };

  // --- Login status ---
  let login = null;
  if (employee.user_id) {
    const { data: profile } = await supabase
      .from("hcm_profiles")
      .select("id, email, role, is_active, must_change_password, created_at")
      .eq("id", employee.user_id)
      .maybeSingle();
    login = profile;
  }

  // --- Company timezone (avg check-in ke liye) ---
  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("timezone")
    .eq("id", 1)
    .maybeSingle();
  const tz = settings?.timezone ?? "Asia/Karachi";

  // --- Attendance: last 30 din ---
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data: attRows } = await supabase
    .from("hcm_attendance")
    .select("date, status, check_in")
    .eq("employee_id", id)
    .gte("date", sinceStr)
    .order("date", { ascending: false });

  const attendance = { total: 0, present: 0, late: 0, half_day: 0, other: 0, avg_check_in: null };
  let checkInSum = 0;
  let checkInCount = 0;
  for (const row of attRows ?? []) {
    attendance.total += 1;
    if (row.status === "present") attendance.present += 1;
    else if (row.status === "late") attendance.late += 1;
    else if (row.status === "half_day") attendance.half_day += 1;
    else attendance.other += 1;
    if (row.check_in) {
      checkInSum += minutesOfDayInTz(new Date(row.check_in), tz);
      checkInCount += 1;
    }
  }
  attendance.avg_check_in_label = checkInCount
    ? minutesToLabel(Math.round(checkInSum / checkInCount))
    : null;

  // --- Leave: current year ---
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const { data: leaveRows } = await supabase
    .from("hcm_leave_requests")
    .select("id, days, status, leave_type_id, hcm_leave_types:leave_type_id ( code, name, yearly_quota )")
    .eq("employee_id", id)
    .gte("start_date", yearStart);

  const leave = {
    approved_days: 0,
    pending_requests: 0,
    rejected_requests: 0,
    byType: [],
  };
  const typeMap = new Map();
  for (const row of leaveRows ?? []) {
    if (row.status === "approved") {
      leave.approved_days += Number(row.days ?? 0);
      const type = row.hcm_leave_types;
      if (type) {
        const entry = typeMap.get(type.id) ?? {
          id: type.id,
          code: type.code,
          name: type.name,
          quota: Number(type.yearly_quota ?? 0),
          used: 0,
        };
        entry.used += Number(row.days ?? 0);
        typeMap.set(type.id, entry);
      }
    } else if (row.status === "pending") {
      leave.pending_requests += 1;
    } else if (row.status === "rejected") {
      leave.rejected_requests += 1;
    }
  }
  leave.byType = [...typeMap.values()].map((t) => ({
    ...t,
    remaining: Math.max(0, t.quota - t.used),
  }));

  return NextResponse.json({
    ok: true,
    data: { employee: normalized, login, attendance, leave, timezone: tz },
  });
});

export const PATCH = apiHandler(async (request, context) => {
  const { id } = await context.params;
  const body = patchSchema.parse(await request.json());
  const { admin, supabase, user, profile } = await requireAuth(["admin", "hr"]);

  const { data: before, error: loadError } = await supabase
    .from("hcm_employees")
    .select(EMPLOYEE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (loadError) throw new ApiError(500, loadError.message);
  if (!before) throw new ApiError(404, "Employee not found.");

  // Department / designation pairing validation
  if (body.departmentId) {
    const { data: dept } = await supabase
      .from("hcm_departments")
      .select("id")
      .eq("id", body.departmentId)
      .maybeSingle();
    if (!dept) throw new ApiError(422, "Selected department does not exist.");
  }
  if (body.designationId) {
    const { data: desig } = await supabase
      .from("hcm_designations")
      .select("id, department_id")
      .eq("id", body.designationId)
      .maybeSingle();
    if (!desig) throw new ApiError(422, "Selected designation does not exist.");
    const deptId = body.departmentId || before.department_id;
    if (deptId && desig.department_id && desig.department_id !== deptId) {
      throw new ApiError(422, "Selected designation belongs to a different department.");
    }
  }

  const updates = {};
  if (body.fullName !== undefined) updates.full_name = body.fullName;
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.address !== undefined) updates.address = body.address || null;
  if (body.gender !== undefined) updates.gender = body.gender || null;
  if (body.departmentId !== undefined) updates.department_id = body.departmentId || null;
  if (body.designationId !== undefined) updates.designation_id = body.designationId || null;
  if (body.joinDate !== undefined) updates.join_date = body.joinDate;
  if (body.exitDate !== undefined) updates.exit_date = body.exitDate || null;
  if (body.basicSalary !== undefined) updates.basic_salary = body.basicSalary;
  if (body.status !== undefined) updates.status = body.status;

  if (Object.keys(updates).length === 0) {
    throw new ApiError(422, "Nothing to update.");
  }

  const { data: after, error: updateError } = await supabase
    .from("hcm_employees")
    .update(updates)
    .eq("id", id)
    .select(EMPLOYEE_SELECT)
    .single();
  if (updateError) throw new ApiError(500, updateError.message);

  // Status toggle → login bhi sync (inactive/exit employee login nahi kar sakta)
  if (body.status && body.status !== before.status && before.user_id) {
    const newActive = body.status === "active";
    const { error: profileError } = await admin
      .from("hcm_profiles")
      .update({ is_active: newActive })
      .eq("id", before.user_id);
    if (profileError) throw new ApiError(500, `Employee updated but login sync failed: ${profileError.message}`);
  }

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "employee.update",
    entity: "hcm_employees",
    entityId: id,
    before: {
      full_name: before.full_name,
      status: before.status,
      department_id: before.department_id,
      designation_id: before.designation_id,
      basic_salary: before.basic_salary,
      join_date: before.join_date,
    },
    after: {
      full_name: after.full_name,
      status: after.status,
      department_id: after.department_id,
      designation_id: after.designation_id,
      basic_salary: after.basic_salary,
      join_date: after.join_date,
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      ...after,
      department_name: after.hcm_departments?.name ?? null,
      designation_name: after.hcm_designations?.name ?? null,
      hcm_departments: undefined,
      hcm_designations: undefined,
    },
  });
});
