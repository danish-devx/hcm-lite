/**
 * Demo users seed script — end-to-end verification ke liye.
 * Creates: hr.demo@example.com (HR) + employee.demo@example.com (Employee)
 * Password (dono): Test@1234
 *
 * Run: bun scripts/seed-demo-users.js
 * Note: ye sirf testing/demo users hain — Supabase dashboard se delete kar sakte hain.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing env vars — .env.local se load honi chahiye");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "Test@1234";

async function ensureUser(email, fullName, role) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const existing = list?.users?.find((u) => u.email === email);

  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    console.log("user exists (password reset):", email);
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  console.log("user created:", email, `(${role})`);
  return data.user.id;
}

async function ensureProfile(userId, email, fullName, role) {
  const { data } = await admin
    .from("hcm_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!data) {
    // Trigger fallback — normally trigger hi bana deti hai
    const { error } = await admin.from("hcm_profiles").insert({
      id: userId,
      email,
      full_name: fullName,
      role,
    });
    if (error) throw new Error(`profile insert ${email}: ${error.message}`);
    console.log("profile inserted:", email);
  } else {
    await admin
      .from("hcm_profiles")
      .update({ role, full_name: fullName, is_active: true })
      .eq("id", userId);
  }
}

async function ensureEmployeeFor(userId, email, fullName) {
  const { data: existing } = await admin
    .from("hcm_employees")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  let emp = existing;
  if (!emp) {
    const code = `EMP-${String(Date.now()).slice(-6)}`;
    const { data, error } = await admin
      .from("hcm_employees")
      .insert({
        code,
        full_name: fullName,
        email,
        join_date: "2025-01-01",
        status: "active",
        basic_salary: 120000,
        phone: "+92 300 0000000",
        address: "Karachi, Pakistan",
        user_id: userId,
      })
      .select()
      .single();
    if (error) throw new Error(`employee insert: ${error.message}`);
    emp = data;
    console.log("employee created:", code);
  } else {
    await admin.from("hcm_employees").update({ user_id: userId }).eq("id", emp.id);
  }

  const { error: linkError } = await admin
    .from("hcm_profiles")
    .update({ employee_id: emp.id })
    .eq("id", userId);
  if (linkError) throw new Error(`profile link: ${linkError.message}`);
  console.log("profile <-> employee linked:", email);
}

// ---- main ----
const hrId = await ensureUser("hr.demo@example.com", "Demo HR", "hr");
await ensureProfile(hrId, "hr.demo@example.com", "Demo HR", "hr");

const empUserId = await ensureUser("employee.demo@example.com", "Bilal Ahmed", "employee");
await ensureProfile(empUserId, "employee.demo@example.com", "Bilal Ahmed", "employee");
await ensureEmployeeFor(empUserId, "employee.demo@example.com", "Bilal Ahmed");

console.log("\nDONE — login creds: hr.demo@example.com / employee.demo@example.com | Test@1234");
