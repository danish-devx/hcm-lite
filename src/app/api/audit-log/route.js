import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";

/**
 * Audit log browser — brief F25 (M9): ADMIN ONLY page.
 * Har important action ka record: actor, action, entity, before/after JSON.
 * Table DB trigger se immutable hai — route sirf read karta hai.
 *
 * Filters: q (action/entity/entity_id search), group (action prefix jaise
 * "leave." / "payroll."), actorId, from/to (created_at date), page.
 */

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  group: z.string().trim().max(40).optional(),
  actorId: z.string().uuid().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
});

const PAGE_SIZE = 25;

function escapeLike(str) {
  return str.replace(/[%_\\]/g, (m) => `\\${m}`);
}

// Legacy Phase-1 actions dot-prefix ke baghair — sensible groups me fold
const GROUP_ALIASES = {
  password_changed: "auth",
  update_own_contact: "auth",
};

function groupOfAction(action) {
  const a = String(action ?? "");
  return GROUP_ALIASES[a] ?? a.split(/[._]/)[0];
}

export const GET = apiHandler(async (request) => {
  const url = new URL(request.url);
  const params = querySchema.parse(Object.fromEntries(url.searchParams.entries()));
  const { supabase, admin } = await requireAuth(["admin"]);

  const page = params.page ?? 1;
  const fromIdx = (page - 1) * PAGE_SIZE;
  const toIdx = fromIdx + PAGE_SIZE - 1;

  let query = supabase
    .from("hcm_audit_logs")
    .select(
      "id, actor_id, actor_role, action, entity, entity_id, before_json, after_json, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (params.q) {
    const safe = escapeLike(params.q);
    query = query.or(
      `action.ilike.%${safe}%,entity.ilike.%${safe}%,entity_id.ilike.%${safe}%`
    );
  }
  if (params.group) {
    // dot-style (leave.apply) aur underscore-style (department_create) dono
    const g = escapeLike(params.group);
    query = query.or(`action.ilike.${g}.%,action.ilike.${g}_%`);
  }
  if (params.actorId) query = query.eq("actor_id", params.actorId);
  if (params.from) query = query.gte("created_at", `${params.from}T00:00:00Z`);
  if (params.to) query = query.lte("created_at", `${params.to}T23:59:59Z`);

  const { data: rows, error, count } = await query;
  if (error) throw new ApiError(500, error.message);

  // Actor names — 2-step lookup (admin client, read-only)
  const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean))];
  let actorsById = new Map();
  if (actorIds.length > 0) {
    const { data: actors } = await admin
      .from("hcm_profiles")
      .select("id, full_name, email, role")
      .in("id", actorIds);
    actorsById = new Map((actors ?? []).map((a) => [a.id, a]));
  }

  const items = (rows ?? []).map((r) => {
    const actor = actorsById.get(r.actor_id);
    return {
      ...r,
      actor: actor
        ? { full_name: actor.full_name, email: actor.email, role: actor.role }
        : { full_name: r.actor_role ? `(${r.actor_role})` : "System", email: null, role: r.actor_role },
    };
  });

  // Action groups — filter dropdown ke liye distinct group bases
  const { data: allActions } = await admin
    .from("hcm_audit_logs")
    .select("action")
    .order("action", { ascending: true })
    .limit(2000);
  const groups = [
    ...new Set((allActions ?? []).map((a) => groupOfAction(a.action))),
  ].sort();
  const actions = [...new Set((allActions ?? []).map((a) => a.action))].sort();

  return NextResponse.json({
    ok: true,
    data: {
      items,
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      groups,
      actions,
    },
  });
});
