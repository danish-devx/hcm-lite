import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";
import {
  generateTempPassword,
  isValidEmail,
} from "@/lib/services/employee.service";

/**
 * GET  /api/users — logins list (admin only): profiles + linked employee info
 * POST /api/users — naya staff login (admin only): role admin|hr
 *       (Employee logins sirf employee registration se bante hain — link ke saath)
 */

const createSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is too short").max(80, "Name is too long"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(["admin", "hr"], {
    message: "Staff login role must be admin or hr (employees register se bante hain).",
  }),
});

export const GET = apiHandler(async () => {
  const { supabase } = await requireAuth(["admin"]);

  const { data, error } = await supabase
    .from("hcm_profiles")
    .select(
      `
      id, email, full_name, role, is_active, must_change_password, created_at, employee_id,
      hcm_employees:employee_id ( code, full_name, status )
    `
    )
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) throw new ApiError(500, error.message);

  const rows = (data ?? []).map((row) => ({
    ...row,
    employee_code: row.hcm_employees?.code ?? null,
    employee_name: row.hcm_employees?.full_name ?? null,
    employee_status: row.hcm_employees?.status ?? null,
    hcm_employees: undefined,
  }));

  return NextResponse.json({ ok: true, data: rows });
});

export const POST = apiHandler(async (request) => {
  const body = createSchema.parse(await request.json());
  const { admin, supabase, user, profile } = await requireAuth(["admin"]);

  if (!isValidEmail(body.email)) throw new ApiError(422, "Enter a valid email address.");

  const { data: dupProfile } = await supabase
    .from("hcm_profiles")
    .select("id")
    .ilike("email", body.email)
    .maybeSingle();
  if (dupProfile) throw new ApiError(409, "A login with this email already exists.");

  const tempPassword = generateTempPassword();

  // NOTE: phase0 trigger (on_auth_user_created) auth user bante hi profile row
  // bana deta hai — isliye INSERT ki jagah UPDATE (fallback INSERT).
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: body.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: body.fullName, role: body.role },
  });
  if (authError || !authData?.user) {
    const msg = authError?.message ?? "Could not create login";
    if (/already.*(registered|exists)|duplicate/i.test(msg)) {
      throw new ApiError(409, "A login with this email already exists.");
    }
    throw new ApiError(500, `Login creation failed: ${msg}`);
  }

  const authUserId = authData.user.id;
  const profileValues = {
    email: body.email,
    full_name: body.fullName,
    role: body.role,
    employee_id: null,
    is_active: true,
    must_change_password: true,
  };

  const { data: updatedRows, error: updateError } = await admin
    .from("hcm_profiles")
    .update(profileValues)
    .eq("id", authUserId)
    .select("id, email, full_name, role, is_active, must_change_password, created_at");

  let created = updatedRows?.[0] ?? null;

  if (!created && !updateError) {
    // Trigger absent — profile insert
    const { data: inserted, error: insertError } = await admin
      .from("hcm_profiles")
      .insert({ id: authUserId, ...profileValues })
      .select("id, email, full_name, role, is_active, must_change_password, created_at")
      .single();
    if (!insertError) created = inserted;
  }

  if (!created) {
    // Rollback — orphan auth user/profile na rahe
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch (cleanupErr) {
      console.error("[USERS] rollback: auth user delete failed:", cleanupErr?.message);
    }
    try {
      await admin.from("hcm_profiles").delete().eq("id", authUserId);
    } catch (cleanupErr) {
      console.error("[USERS] rollback: profile delete failed:", cleanupErr?.message);
    }
    throw new ApiError(500, updateError?.message ?? "Profile creation failed.");
  }

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "login.create",
    entity: "hcm_profiles",
    entityId: created.id,
    after: { email: created.email, role: created.role, full_name: created.full_name },
  });

  return NextResponse.json(
    { ok: true, data: { profile: created, tempPassword } },
    { status: 201 }
  );
});
