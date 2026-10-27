import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";

/**
 * In-app notifications — brief F24 (M9)
 *  GET  — mere notifications (latest 30) + unread count (RLS: own-only)
 *  POST — mark read: { ids: [...] } ya { all: true } (RLS: notif_update_own)
 */

const markSchema = z.object({
  ids: z.array(z.string().uuid()).max(50).optional(),
  all: z.boolean().optional(),
});

export const GET = apiHandler(async () => {
  const { supabase, profile } = await requireAuth();

  const [listRes, unreadRes] = await Promise.all([
    supabase
      .from("hcm_notifications")
      .select("id, title, body, link, is_read, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("hcm_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("is_read", false),
  ]);

  if (listRes.error) throw new ApiError(500, listRes.error.message);
  if (unreadRes.error) throw new ApiError(500, unreadRes.error.message);

  return NextResponse.json({
    ok: true,
    data: {
      items: listRes.data ?? [],
      unread: unreadRes.count ?? 0,
    },
  });
});

export const POST = apiHandler(async (request) => {
  const body = markSchema.parse(await request.json().catch(() => ({})));
  const { supabase, profile } = await requireAuth();

  if (!body.all && (!body.ids || body.ids.length === 0)) {
    throw new ApiError(422, "Provide notification ids or all=true.");
  }

  let query = supabase
    .from("hcm_notifications")
    .update({ is_read: true })
    .eq("user_id", profile.id); // scope-guard: doosron ki notifications kabhi nahi

  query = body.all ? query.eq("is_read", false) : query.in("id", body.ids);

  const { data, error } = await query.select("id");
  if (error) throw new ApiError(500, error.message);

  return NextResponse.json({ ok: true, data: { updated: data?.length ?? 0 } });
});
