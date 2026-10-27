import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";
import { monthTitle } from "@/lib/services/payroll.service";
import { notifyMany } from "@/lib/services/notification.service";

/**
 * POST /api/payroll/runs/[id]/finalize — ADMIN ONLY (brief: HR cannot
 * finalize payroll; only Admin can lock it).
 *  - Draft hi finalize ho sakta hai (finalized → 409)
 *  - Finalized runs LOCKED: edit/delete kabhi nahi (audit trail permanent)
 */

export const POST = apiHandler(async (request, context) => {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) {
    throw new ApiError(404, "Payroll run not found.");
  }
  const { supabase, profile } = await requireAuth(["admin"]);

  const { data: run, error } = await supabase
    .from("hcm_payroll_runs")
    .select("id, month, status, created_by, finalized_by, finalized_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!run) throw new ApiError(404, "Payroll run not found.");
  if (run.status === "finalized") {
    throw new ApiError(409, "This run is already finalized and locked.");
  }

  const { count, error: cntErr } = await supabase
    .from("hcm_payroll_items")
    .select("id", { count: "exact", head: true })
    .eq("run_id", id);
  if (cntErr) throw new ApiError(500, cntErr.message);
  if (!count || count === 0) {
    throw new ApiError(422, "Run has no payroll items — nothing to finalize.");
  }

  const { data: updated, error: updErr } = await supabase
    .from("hcm_payroll_runs")
    .update({ status: "finalized", finalized_by: profile.id, finalized_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft") // race-safe: doosra finalize beech me ho gaya to no-op
    .select("id, month, status, finalized_by, finalized_at")
    .single();
  if (updErr) throw new ApiError(500, updErr.message);
  if (!updated) throw new ApiError(409, "This run is already finalized and locked.");

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: "payroll.finalize",
    entity: "hcm_payroll_runs",
    entityId: id,
    before: { status: "draft" },
    after: { status: "finalized", month: run.month },
  });

  // F24 — run ke sab employees ko "payslip ready" notification (fail-safe).
  // Sirf login-linked employees ko — user_id null wale skip.
  const { data: itemUsers } = await supabase
    .from("hcm_payroll_items")
    .select("hcm_employees:employee_id ( user_id )")
    .eq("run_id", id);
  const recipients = (itemUsers ?? [])
    .map((r) => r.hcm_employees?.user_id)
    .filter(Boolean);
  if (recipients.length > 0) {
    await notifyMany(recipients, {
      title: `Payslip ready — ${monthTitle(run.month)}`,
      body: "Your payslip is finalized and ready to download.",
      link: "/payroll",
    });
  }

  return NextResponse.json({ ok: true, data: { run: updated } });
});
