import crypto from "node:crypto";

import { ApiError } from "@/lib/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * Employee service (Phase 3) — business rules employee records + auto-login ke liye.
 * Privileged auth ops service_role admin client se hote hain (RLS bypass, server-only).
 */

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // ambiguous chars (0/O/1/I) hata diye
const PASSWORD_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ!@#$%";

function randomFrom(alphabet, length) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/** Temp password — pehli login par change force hoga (must_change_password). */
export function generateTempPassword() {
  return `Bloom-${randomFrom(PASSWORD_ALPHABET, 10)}`;
}

/**
 * Unique employee code — EMP-XXXXXX (6 chars).
 * DB me collision check, max 8 tries (practically kabhi clash nahi hoga).
 */
export async function generateEmployeeCode(supabase) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `EMP-${randomFrom(CODE_ALPHABET, 6)}`;
    const { data: existing } = await supabase
      .from("hcm_employees")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!existing) return code;
  }
  throw new ApiError(500, "Could not generate a unique employee code. Try again.");
}

/**
 * Profile link/update — IMPORTANT: phase0 SQL ka `on_auth_user_created` trigger
 * auth user bante hi hcm_profiles row INSERT kar deta hai (role=employee default).
 * Isliye pehle UPDATE karte hain (trigger wali row link), aur agar row nahi mili
 * (trigger absent) to INSERT fallback.
 */
async function upsertLinkedProfile({ admin, authUserId, payload, employeeId, role = "employee" }) {
  const values = {
    email: payload.email,
    full_name: payload.fullName,
    role,
    must_change_password: true,
    is_active: true,
  };
  if (employeeId) values.employee_id = employeeId;

  const { data: updated, error: updateError } = await admin
    .from("hcm_profiles")
    .update(values)
    .eq("id", authUserId)
    .select("id, email, full_name, role, employee_id, is_active, must_change_password");

  if (updateError) throw new ApiError(500, updateError.message);
  if (updated && updated.length > 0) return updated[0];

  // Trigger absent hai — profile insert karo
  const { data: inserted, error: insertError } = await admin
    .from("hcm_profiles")
    .insert({ id: authUserId, ...values })
    .select("id, email, full_name, role, employee_id, is_active, must_change_password")
    .single();
  if (insertError) throw new ApiError(500, insertError.message);
  return inserted;
}

/**
 * Employee + login creation — transaction-style with cleanup.
 * Order: auth user (profile trigger auto-runs) → employee row → profile link/update.
 * Koi step fail ho to auth user + employee + orphan profile sab clean (orphan accounts nahi).
 *
 * Returns { employee, profile, tempPassword }
 */
export async function createEmployeeWithLogin({ admin, supabase, actor, payload }) {
  const tempPassword = payload.tempPassword ?? generateTempPassword();
  const code = payload.code ?? (await generateEmployeeCode(supabase));

  // 1) Auth user (auto login)
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: payload.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: payload.fullName },
  });

  if (authError || !authData?.user) {
    const msg = authError?.message ?? "Could not create login";
    if (/already.*(registered|exists)|duplicate/i.test(msg)) {
      throw new ApiError(409, "An account with this email already exists.");
    }
    throw new ApiError(500, `Login creation failed: ${msg}`);
  }

  const authUserId = authData.user.id;

  try {
    // 2) Employee record
    const { data: employee, error: empError } = await admin
      .from("hcm_employees")
      .insert({
        code,
        full_name: payload.fullName,
        email: payload.email,
        phone: payload.phone || null,
        address: payload.address || null,
        gender: payload.gender || null,
        department_id: payload.departmentId || null,
        designation_id: payload.designationId || null,
        join_date: payload.joinDate,
        exit_date: payload.exitDate || null,
        status: payload.status ?? "active",
        basic_salary: payload.basicSalary ?? 0,
        user_id: authUserId,
      })
      .select("*")
      .single();

    if (empError) throw new ApiError(500, empError.message);

    // 3) Profile link (trigger wali row update, warna insert) — first login par change force
    const profile = await upsertLinkedProfile({
      admin,
      authUserId,
      payload,
      employeeId: employee.id,
      role: "employee",
    });

    await writeAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: "employee.create",
      entity: "hcm_employees",
      entityId: employee.id,
      after: {
        code: employee.code,
        email: employee.email,
        full_name: employee.full_name,
        status: employee.status,
        auto_login: true,
      },
    });
    await writeAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: "login.create",
      entity: "hcm_profiles",
      entityId: profile.id,
      after: { email: profile.email, role: "employee", linked_employee: employee.code },
    });

    return { employee, profile, tempPassword };
  } catch (err) {
    // Rollback — orphan auth user / employee / profile kuch na bache
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch (cleanupErr) {
      console.error("[EMPLOYEE] rollback: auth user delete failed:", cleanupErr?.message);
    }
    try {
      await admin.from("hcm_profiles").delete().eq("id", authUserId);
    } catch (cleanupErr) {
      console.error("[EMPLOYEE] rollback: profile delete failed:", cleanupErr?.message);
    }
    try {
      await admin.from("hcm_employees").delete().eq("user_id", authUserId);
    } catch (cleanupErr) {
      console.error("[EMPLOYEE] rollback: employee delete failed:", cleanupErr?.message);
    }
    throw err;
  }
}

/** Email format check — import + create dono use karte hain. */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
