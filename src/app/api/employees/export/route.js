import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { toCsv } from "@/lib/csv";

/**
 * GET /api/employees/export — directory CSV download (admin + hr).
 * File: employees-YYYY-MM-DD.csv
 */
export const GET = apiHandler(async () => {
  const { supabase } = await requireAuth(["admin", "hr"]);

  const { data, error } = await supabase
    .from("hcm_employees")
    .select(
      `
      code, full_name, email, phone, gender, join_date, exit_date, status, basic_salary, address,
      hcm_departments:department_id ( name ),
      hcm_designations:designation_id ( name )
    `
    )
    .order("code", { ascending: true })
    .limit(1000);

  if (error) throw new ApiError(500, error.message);

  const headers = [
    "code",
    "full_name",
    "email",
    "phone",
    "gender",
    "department",
    "designation",
    "join_date",
    "status",
    "basic_salary",
    "address",
  ];

  const csv = toCsv(
    headers,
    (data ?? []).map((row) => ({
      code: row.code,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone ?? "",
      gender: row.gender ?? "",
      department: row.hcm_departments?.name ?? "",
      designation: row.hcm_designations?.name ?? "",
      join_date: row.join_date ?? "",
      status: row.status,
      basic_salary: row.basic_salary ?? 0,
      address: row.address ?? "",
    }))
  );

  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="employees-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
