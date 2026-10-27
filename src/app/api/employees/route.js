import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { createEmployeeWithLogin, isValidEmail } from "@/lib/services/employee.service";

/**
 * GET  /api/employees — directory list (admin + hr)
 *      ?q=<name|email|code> &department=<uuid> &status=active|inactive
 * POST /api/employees — register employee + AUTO LOGIN (admin + hr)
 *      Response: { ok, data: { employee, tempPassword } } — temp password sirf ek dafa.
 */

const EMPLOYEE_SELECT = `
  id, code, full_name, email, phone, gender, department_id, designation_id,
  join_date, exit_date, status, basic_salary, user_id, created_at,
  hcm_departments:department_id ( name ),
  hcm_designations:designation_id ( name )
`;

const createSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is too short").max(80, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other", ""]).optional(),
  departmentId: z.string().uuid().optional().or(z.literal("")),
  designationId: z.string().uuid().optional().or(z.literal("")),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Join date is required (YYYY-MM-DD)"),
  basicSalary: z.coerce.number().min(0, "Salary cannot be negative").max(100000000),
  address: z.string().trim().max(300).optional().or(z.literal("")),
});

export const GET = apiHandler(async (request) => {
  const { supabase } = await requireAuth(["admin", "hr"]);

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const department = searchParams.get("department") ?? "";
  const status = searchParams.get("status") ?? "";

  let query = supabase
    .from("hcm_employees")
    .select(EMPLOYEE_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);

  if (q) {
    // name / email / code — ek hi search box
    const safe = q.replace(/[%,()]/g, "");
    if (safe) {
      query = query.or(
        [`full_name.ilike.%${safe}%`, `email.ilike.%${safe}%`, `code.ilike.%${safe}%`].join(",")
      );
    }
  }
  if (department) query = query.eq("department_id", department);
  if (status === "active" || status === "inactive") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);

  const rows = (data ?? []).map((row) => ({
    ...row,
    department_name: row.hcm_departments?.name ?? null,
    designation_name: row.hcm_designations?.name ?? null,
    hcm_departments: undefined,
    hcm_designations: undefined,
  }));

  return NextResponse.json({ ok: true, data: rows });
});

export const POST = apiHandler(async (request) => {
  const body = createSchema.parse(await request.json());
  const { admin, supabase, user, profile } = await requireAuth(["admin", "hr"]);

  // Email duplicate guard — friendly 409 (auth error se pehle clear message)
  const { data: dupEmp } = await supabase
    .from("hcm_employees")
    .select("id")
    .ilike("email", body.email)
    .maybeSingle();
  if (dupEmp) throw new ApiError(409, "An employee with this email already exists.");

  // Department + designation existence + pairing check
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
    if (body.departmentId && desig.department_id && desig.department_id !== body.departmentId) {
      throw new ApiError(422, "Selected designation belongs to a different department.");
    }
  }

  if (!isValidEmail(body.email)) throw new ApiError(422, "Enter a valid email address.");

  const { employee, tempPassword } = await createEmployeeWithLogin({
    admin,
    supabase,
    actor: { id: user.id, role: profile.role },
    payload: {
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      address: body.address,
      gender: body.gender || null,
      departmentId: body.departmentId || null,
      designationId: body.designationId || null,
      joinDate: body.joinDate,
      basicSalary: body.basicSalary,
      status: "active",
    },
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        employee: { ...employee, department_name: null, designation_name: null },
        tempPassword,
      },
    },
    { status: 201 }
  );
});
