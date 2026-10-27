import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { parseCsv } from "@/lib/csv";
import { writeAudit } from "@/lib/services/audit.service";
import {
  createEmployeeWithLogin,
  isValidEmail,
} from "@/lib/services/employee.service";

/**
 * POST /api/employees/import — CSV bulk import with DRY-RUN (F05)
 * Body: { mode: "dry_run" | "commit", csv: "<raw csv text>" }
 *
 * dry_run → har row validate hoti hai (kuch create nahi hota):
 *   valid rows + error rows (row number + reason) return hote hain
 * commit  → sirf valid rows create hoti hain (auto login + temp password)
 *
 * Columns: full_name,email,phone,gender,department,designation,join_date,basic_salary,address
 */
const bodySchema = z.object({
  mode: z.enum(["dry_run", "commit"]),
  csv: z.string().min(1, "CSV content is required").max(2_000_000, "CSV is too large (max ~2MB)"),
});

const MAX_ROWS = 300;

export const POST = apiHandler(async (request) => {
  const body = bodySchema.parse(await request.json());
  const { admin, supabase, user, profile } = await requireAuth(["admin", "hr"]);

  const { rows } = parseCsv(body.csv);
  if (rows.length === 0) throw new ApiError(422, "CSV is empty — no data rows found.");
  if (rows.length > MAX_ROWS) {
    throw new ApiError(422, `Too many rows (${rows.length}). Limit is ${MAX_ROWS} per import.`);
  }

  // Org lookups — department/designation name → id (case-insensitive)
  const [{ data: departments }, { data: designations }, { data: existingEmployees }] =
    await Promise.all([
      supabase.from("hcm_departments").select("id, name"),
      supabase.from("hcm_designations").select("id, name, department_id"),
      supabase.from("hcm_employees").select("email"),
    ]);

  const deptByName = new Map((departments ?? []).map((d) => [d.name.trim().toLowerCase(), d]));
  const desigByName = new Map((designations ?? []).map((d) => [d.name.trim().toLowerCase(), d]));
  const existingEmails = new Set((existingEmployees ?? []).map((e) => (e.email ?? "").toLowerCase()));

  const valid = [];
  const errors = [];
  const seenEmails = new Set();

  rows.forEach((row, idx) => {
    const rowNo = idx + 2; // header +1, human-friendly
    const name = (row.full_name ?? "").trim();
    const email = (row.email ?? "").trim().toLowerCase();
    const emailKey = (row.email ?? "").trim().replace(/\s+/g, "");
    const reasons = [];

    if (name.length < 2) reasons.push("Full name is required (min 2 characters).");
    if (!email) reasons.push("Email is required.");
    else if (!isValidEmail(email)) reasons.push(`"${email}" is not a valid email.`);
    else if (existingEmails.has(email)) reasons.push(`An employee with email "${email}" already exists.`);
    else if (seenEmails.has(emailKey)) reasons.push(`Duplicate email "${email}" inside the file.`);
    else seenEmails.add(emailKey);

    let joinDate = (row.join_date ?? "").trim();
    if (joinDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(joinDate) || Number.isNaN(Date.parse(joinDate))) {
        reasons.push("join_date must be YYYY-MM-DD (e.g. 2026-01-15).");
      }
    } else {
      joinDate = new Date().toISOString().slice(0, 10); // default: aaj
    }

    let salary = 0;
    const salaryRaw = (row.basic_salary ?? "").trim().replace(/,/g, "");
    if (salaryRaw) {
      const parsed = Number(salaryRaw);
      if (Number.isNaN(parsed) || parsed < 0) reasons.push(`basic_salary "${salaryRaw}" is not a valid amount.`);
      else salary = parsed;
    }

    let gender = (row.gender ?? "").trim().toLowerCase();
    if (gender && !["male", "female", "other"].includes(gender)) {
      reasons.push(`gender must be male / female / other (got "${gender}").`);
      gender = "";
    }

    let departmentId = null;
    const deptName = (row.department ?? "").trim();
    if (deptName) {
      const dept = deptByName.get(deptName.toLowerCase());
      if (!dept) reasons.push(`Department "${deptName}" does not exist — add it first (Organization).`);
      else departmentId = dept.id;
    }

    let designationId = null;
    const desigName = (row.designation ?? "").trim();
    if (desigName) {
      const desig = desigByName.get(desigName.toLowerCase());
      if (!desig) reasons.push(`Designation "${desigName}" does not exist — add it first (Organization).`);
      else if (departmentId && desig.department_id && desig.department_id !== departmentId) {
        reasons.push(`Designation "${desigName}" belongs to a different department than "${deptName}".`);
      } else {
        designationId = desig.id;
        // department missing but designation has one → usi se department link
        if (!departmentId && desig.department_id) departmentId = desig.department_id;
      }
    }

    if (reasons.length > 0) {
      errors.push({ row: rowNo, name: name || "—", email: email || "—", reason: reasons.join(" ") });
      return;
    }

    valid.push({
      fullName: name,
      email,
      phone: (row.phone ?? "").trim(),
      address: (row.address ?? "").trim(),
      gender: gender || null,
      departmentId,
      designationId,
      joinDate,
      basicSalary: salary,
      status: "active",
    });
  });

  if (body.mode === "dry_run") {
    return NextResponse.json({
      ok: true,
      data: { mode: "dry_run", total: rows.length, validCount: valid.length, errorCount: errors.length, errors },
    });
  }

  // ---- commit ----
  if (valid.length === 0) {
    throw new ApiError(422, "No valid rows to import — fix the errors first (run dry-run).");
  }

  const accounts = [];
  const failed = [];
  for (const [idx, payload] of valid.entries()) {
    try {
      const { employee, tempPassword } = await createEmployeeWithLogin({
        admin,
        supabase,
        actor: { id: user.id, role: profile.role },
        payload,
      });
      accounts.push({
        code: employee.code,
        name: employee.full_name,
        email: employee.email,
        tempPassword,
      });
    } catch (err) {
      failed.push({
        row: idx + 2,
        name: payload.fullName,
        email: payload.email,
        reason: err?.message ?? "Import failed",
      });
    }
  }

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "employee.import",
    entity: "hcm_employees",
    entityId: null,
    after: { attempted: valid.length, created: accounts.length, failed: failed.length },
  });

  return NextResponse.json({
    ok: true,
    data: {
      mode: "commit",
      total: rows.length,
      created: accounts.length,
      failedCount: failed.length,
      failed,
      accounts,
    },
  });
});
