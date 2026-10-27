import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";
import { computeRunItems } from "@/lib/services/payroll-run.helper";

/**
 * POST /api/payroll/runs/[id]/recalculate — staff, DRAFT only.
 * Attendance/leave/holidays aaj ke data se items dobara compute hote hain
 * (finalize ke baad allowed nahi — brief: finalized runs locked).
 */
export const POST = apiHandler(async (request, context) => {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) {
    throw new ApiError(404, "Payroll run not found.");
  }
  const { supabase, admin, profile } = await requireAuth(["admin", "hr"]);

  const { data: run, error } = await supabase
    .from("hcm_payroll_runs")
    .select("id, month, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!run) throw new ApiError(404, "Payroll run not found.");
  if (run.status === "finalized") {
    throw new ApiError(409, "Finalized runs are locked — cannot recalculate.");
  }

  const { items, skipped } = await computeRunItems(supabase, run.month);

  // Replace-all: purane items gaye, naye compute ke items aaye (service_role —
  // delete/insert privileged, RBAC upar enforce ho chuka)
  const { error: delErr } = await admin
    .from("hcm_payroll_items")
    .delete()
    .eq("run_id", id);
  if (delErr) throw new ApiError(500, delErr.message);

  // per_day / late_days / late_penalty_days response-only hain — DB columns nahi
  const rows = items.map(
    ({ per_day: _pd, late_days: _ld, late_penalty_days: _lp, ...it }) => ({ ...it, run_id: id })
  );
  const { error: insErr } = await admin.from("hcm_payroll_items").insert(rows);
  if (insErr) throw new ApiError(500, insErr.message);

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: "payroll.recalculate",
    entity: "hcm_payroll_runs",
    entityId: id,
    after: { month: run.month, items: rows.length, skipped: skipped.length },
  });

  return NextResponse.json({ ok: true, data: { items: rows.length, skipped } });
});
