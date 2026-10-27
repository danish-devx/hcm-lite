import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Audit log — brief M9 requirement:
 * har important action par actor, action, entity, before/after JSON record hota hai.
 * Table immutable hai (DB trigger update/delete block karta hai).
 *
 * Fail-safe hai: audit fail hona main business operation ko fail nahi karega,
 * lekin console me log zaroor hoga.
 */
export async function writeAudit({
  actorId = null,
  actorRole = null,
  action,
  entity,
  entityId = null,
  before = null,
  after = null,
}) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("hcm_audit_logs").insert({
      actor_id: actorId,
      actor_role: actorRole,
      action,
      entity,
      entity_id: entityId ? String(entityId) : null,
      before_json: before,
      after_json: after,
    });
    if (error) console.error("[AUDIT] insert failed:", error.message);
  } catch (err) {
    console.error("[AUDIT] unexpected failure:", err?.message);
  }
}
