import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";

/**
 * GET /api/payroll/me — employee self-service payslips.
 *  - Employee-linked users: finalized-run payslips (month desc) + summary
 *  - Unlinked users: { linked: false, rows: [] } (UI empty state handle karega)
 *  - Staff bhi call kar sakte hain (agar employee-linked hain)
 * Draft runs yahan KABHI nahi dikhte (employee cannot see draft payroll).
 */
export const GET = apiHandler(async () => {
  const { supabase, profile } = await requireAuth();

  if (!profile.employee_id) {
    return NextResponse.json({
      ok: true,
      data: { linked: false, rows: [], summary: null },
    });
  }

  const { data: items, error } = await supabase
    .from("hcm_payroll_items")
    .select(
      `id, run_id, basic, gross, working_days, payable_days, absent_days,
       unpaid_days, half_days, deductions, tax, net,
       run:hcm_payroll_runs!hcm_payroll_items_run_id_fkey(month, status, finalized_at)`
    )
    .eq("employee_id", profile.employee_id)
    .order("created_at", { ascending: false });
  if (error) {
    // FK-name fallback: bina embed ke runs alag se
    const { data: plainItems, error: pErr } = await supabase
      .from("hcm_payroll_items")
      .select(
        "id, run_id, basic, gross, working_days, payable_days, absent_days, unpaid_days, half_days, deductions, tax, net"
      )
      .eq("employee_id", profile.employee_id)
      .order("created_at", { ascending: false });
    if (pErr) throw new ApiError(500, pErr.message);

    const runIds = [...new Set((plainItems ?? []).map((i) => i.run_id))];
    const { data: runs } = runIds.length
      ? await supabase
          .from("hcm_payroll_runs")
          .select("id, month, status, finalized_at")
          .in("id", runIds)
      : { data: [] };
    const runById = new Map((runs ?? []).map((r) => [r.id, r]));

    const rows = (plainItems ?? [])
      .filter((i) => runById.get(i.run_id)?.status === "finalized")
      .map((i) => ({ ...i, run: runById.get(i.run_id) }));
    return NextResponse.json({
      ok: true,
      data: { linked: true, rows, summary: summarize(rows) },
    });
  }

  const rows = (items ?? [])
    .filter((i) => i.run?.status === "finalized")
    .sort((a, b) => (a.run.month < b.run.month ? 1 : -1));

  return NextResponse.json({
    ok: true,
    data: { linked: true, rows, summary: summarize(rows) },
  });
});

function summarize(rows) {
  if (!rows || rows.length === 0) return null;
  const latest = rows[0];
  return {
    payslips: rows.length,
    lastMonth: latest.run.month,
    lastNet: Number(latest.net ?? 0),
    lastGross: Number(latest.gross ?? 0),
    ytdNet: rows.reduce((s, r) => s + Number(r.net ?? 0), 0),
  };
}
