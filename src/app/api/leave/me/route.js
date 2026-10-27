import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { todayInTz } from "@/lib/services/attendance.service";
import { computeBalances } from "@/lib/services/leave.service";

/**
 * GET /api/leave/me — self-service snapshot (M5):
 *  - linked login? (employee record link)
 *  - leave types + balances (current year)
 *  - meri requests (recent 50)
 *  - today / timezone / weekendDays (dialog prefill + UI)
 * No-link users ko bhi meta milta hai (staff logins sabse zyada) — balances
 * sirf linked ke liye.
 */
export const GET = apiHandler(async () => {
  const { supabase, profile } = await requireAuth();

  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("timezone, weekend_days")
    .eq("id", 1)
    .maybeSingle();

  const tz = settings?.timezone ?? "Asia/Karachi";
  const today = todayInTz(tz);
  const year = Number(today.slice(0, 4));

  const [typesRes, holRes, reqRes] = await Promise.all([
    supabase.from("hcm_leave_types").select("*").order("is_paid", { ascending: false }).order("code"),
    supabase.from("hcm_holidays").select("date").gte("date", `${year}-01-01`).lte("date", `${year}-12-31`),
    profile.employee_id
      ? supabase
          .from("hcm_leave_requests")
          .select(`
            id, employee_id, leave_type_id, start_date, end_date, days, reason,
            status, decision_comment, created_at
          `)
          .eq("employee_id", profile.employee_id)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const err = typesRes.error || holRes.error || reqRes.error;
  if (err) throw new ApiError(500, err.message);

  const leaveTypes = typesRes.data ?? [];
  const myRequests = reqRes.data ?? [];
  const yearRequests = myRequests.filter((r) => r.start_date?.startsWith(String(year)));

  const balances = profile.employee_id
    ? computeBalances(leaveTypes, yearRequests, year)
    : [];

  const pendingCount = myRequests.filter((r) => r.status === "pending").length;

  return NextResponse.json({
    ok: true,
    data: {
      linked: Boolean(profile.employee_id),
      today,
      year,
      timezone: tz,
      weekendDays: settings?.weekend_days ?? [0, 6],
      holidays: (holRes.data ?? []).map((h) => h.date),
      leaveTypes,
      balances,
      myRequests,
      pendingCount,
    },
  });
});
