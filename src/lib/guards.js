import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * API-layer error: route handler isko clean JSON response me convert karta hai.
 */
export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Har protected API route ka entry point:
 * 1. JWT verify (Supabase auth)
 * 2. Profile load (role, is_active, employee link)
 * 3. Role check (optional roles list)
 * 4. Employee record load (employee-linked users ke liye)
 *
 * Server-side scope check — brief ka core security requirement.
 */
export async function requireAuth(roles = []) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ApiError(401, "Not authenticated");
  }

  const { data: profile, error: profileError } = await supabase
    .from("hcm_profiles")
    .select(
      "id, email, full_name, role, employee_id, is_active, must_change_password"
    )
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new ApiError(401, "Profile not found. Contact your administrator.");
  }

  if (!profile.is_active) {
    throw new ApiError(403, "Your account has been deactivated.");
  }

  if (roles.length > 0 && !roles.includes(profile.role)) {
    throw new ApiError(403, "You do not have permission to perform this action.");
  }

  let employee = null;
  if (profile.employee_id) {
    const { data: emp } = await supabase
      .from("hcm_employees")
      .select("*")
      .eq("id", profile.employee_id)
      .single();
    employee = emp;
  }

  return {
    supabase,
    admin: createAdminClient(),
    user,
    profile,
    employee,
  };
}

/**
 * Layout/pages ke liye — throw nahi karta, null deta hai.
 */
export async function getSession() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("hcm_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile || !profile.is_active) return null;

    let employee = null;
    if (profile.employee_id) {
      const { data: emp } = await supabase
        .from("hcm_employees")
        .select("*")
        .eq("id", profile.employee_id)
        .single();
      employee = emp;
    }

    return { supabase, user, profile, employee };
  } catch {
    return null;
  }
}

/**
 * Route handler wrapper — ApiError / ZodError ko proper HTTP response banata hai.
 * Usage: export const POST = apiHandler(async (req) => { ... })
 */
export function apiHandler(fn) {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Validation failed",
            details: error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
          { status: 422 }
        );
      }
      if (error instanceof ApiError) {
        return NextResponse.json(
          { error: error.message, details: error.details },
          { status: error.status }
        );
      }
      console.error("[API] Unhandled error:", error);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }
  };
}
