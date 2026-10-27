import { NextResponse } from "next/server";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * DELETE /api/announcements/[id] (M9)
 *  - Admin: koi bhi announcement delete kar sakta hai
 *  - HR: sirf APNI announcement (delete-policy DB par admin-only hai,
 *    isliye RBAC code + admin client use karte hain — corrections route pattern)
 *  - Employee: 403
 */

export const DELETE = apiHandler(async (request, { params }) => {
  const { id } = await params;
  const { profile } = await requireAuth(["admin", "hr"]);
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const { data: row, error: loadErr } = await admin
    .from("hcm_announcements")
    .select("id, title, body, author_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) throw new ApiError(500, loadErr.message);
  if (!row) throw new ApiError(404, "Announcement not found.");

  if (profile.role !== "admin" && row.author_id !== profile.id) {
    throw new ApiError(403, "You can only delete your own announcements.");
  }

  const { error: delErr } = await admin
    .from("hcm_announcements")
    .delete()
    .eq("id", id);
  if (delErr) throw new ApiError(500, delErr.message);

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: "announcement.delete",
    entity: "hcm_announcements",
    entityId: id,
    before: { title: row.title, author_id: row.author_id },
  });

  return NextResponse.json({ ok: true, data: { id } });
});
