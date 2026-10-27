import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";
import { computeRunItems } from "@/lib/services/payroll-run.helper";
import { MONTH_RE } from "@/lib/services/payroll.service";

/**
 * GET  /api/payroll/runs — staff: run list + per-run totals
 * POST /api/payroll/runs — staff: create draft run for a month (unique 409)
 */

const createSchema = z.object({
  month: z.string().regex(MONTH_RE, "Month must be in YYYY-MM format."),
});

export const GET = apiHandler(async () => {
  const { supabase, profile } = await requireAuth();
  if (profile.role !== "admin" && profile.role !== "hr") {
    throw new ApiError(403, "Payroll runs are staff-only. Use /api/payroll/me.");
  }

  const { data: runs, error } = await supabase
    .from("hcm_payroll_runs")
    .select("id, month, status, created_by, finalized_by, finalized_at, created_at")
    .order("month", { ascending: false });
  if (error) throw new ApiError(500, error.message);

  // ---- Totals + actor names (separate lookups, FK-name safe) ----
  const ids = (runs ?? []).map((r) => r.id);
  const totalsByRun = new Map();
  if (ids.length > 0) {
    const { data: items, error: itErr } = await supabase
      .from("hcm_payroll_items")
      .select("run_id, gross, deductions, tax, net")
      .in("run_id", ids);
    if (itErr) throw new ApiError(500, itErr.message);
    for (const it of items ?? []) {
      const t = totalsByRun.get(it.run_id) ?? {
        employees: 0,
        gross: 0,
        deductions: 0,
        tax: 0,
        net: 0,
      };
      t.employees += 1;
      t.gross += Number(it.gross ?? 0);
      t.deductions += Number(it.deductions ?? 0);
      t.tax += Number(it.tax ?? 0);
      t.net += Number(it.net ?? 0);
      totalsByRun.set(it.run_id, t);
    }
  }

  const actorIds = [
    ...new Set(
      (runs ?? []).flatMap((r) => [r.created_by, r.finalized_by]).filter(Boolean)
    ),
  ];
  const nameById = new Map();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("hcm_profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of profiles ?? []) nameById.set(p.id, p.full_name);
  }

  const rows = (runs ?? []).map((r) => {
    const totals = totalsByRun.get(r.id) ?? {
      employees: 0,
      gross: 0,
      deductions: 0,
      tax: 0,
      net: 0,
    };
    return {
      ...r,
      totals,
      createdByName: nameById.get(r.created_by) ?? null,
      finalizedByName: nameById.get(r.finalized_by) ?? null,
    };
  });

  return NextResponse.json({ ok: true, data: { rows } });
});

export const POST = apiHandler(async (request) => {
  const body = createSchema.parse(await request.json());
  const { supabase, admin, profile } = await requireAuth(["admin", "hr"]);

  // Unique month — draft ya finalized, koi bhi ho
  const { data: existing } = await supabase
    .from("hcm_payroll_runs")
    .select("id, status")
    .eq("month", body.month)
    .maybeSingle();
  if (existing) {
    throw new ApiError(
      409,
      `A payroll run for ${body.month} already exists (${existing.status}).`
    );
  }

  const { items, skipped } = await computeRunItems(supabase, body.month);

  const { data: run, error: runErr } = await supabase
    .from("hcm_payroll_runs")
    .insert({ month: body.month, status: "draft", created_by: profile.id })
    .select("id, month, status, created_by, finalized_by, finalized_at, created_at")
    .single();
  if (runErr) {
    if (runErr.code === "23505") {
      throw new ApiError(409, `A payroll run for ${body.month} already exists.`);
    }
    throw new ApiError(500, runErr.message);
  }

  // per_day / late_days / late_penalty_days response-only hain — DB columns nahi
  const rows = items.map(
    ({ per_day: _pd, late_days: _ld, late_penalty_days: _lp, ...it }) => ({ ...it, run_id: run.id })
  );
  const { error: insErr } = await admin.from("hcm_payroll_items").insert(rows);
  if (insErr) {
    // run orphan na bachay (runs par delete RLS policy nahi — admin client)
    await admin.from("hcm_payroll_runs").delete().eq("id", run.id);
    throw new ApiError(500, insErr.message);
  }

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: "payroll.run_create",
    entity: "hcm_payroll_runs",
    entityId: run.id,
    after: { month: body.month, items: rows.length, skipped: skipped.length },
  });

  return NextResponse.json(
    { ok: true, data: { run, skipped } },
    { status: 201 }
  );
});
