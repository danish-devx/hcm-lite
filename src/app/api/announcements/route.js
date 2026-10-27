import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";
import { notifyMany } from "@/lib/services/notification.service";

/**
 * Announcements — brief F23 (M9):
 *  GET  — sab roles (latest feed, author name ke saath)
 *  POST — admin/hr post karte hain; sab ACTIVE users ko in-app
 *         notification fan-out hoti hai (author khud ko nahi)
 */

const postSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title is too short")
    .max(120, "Title must be 120 characters or less"),
  body: z
    .string()
    .trim()
    .min(5, "Announcement body is too short")
    .max(2000, "Body must be 2000 characters or less"),
});

export const GET = apiHandler(async (request) => {
  const { supabase, admin, profile } = await requireAuth();

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), 50)
    : 50;

  // RLS "ann_select_all" — har authed role feed dekh sakta hai (session client)
  const { data: rows, error } = await supabase
    .from("hcm_announcements")
    .select("id, title, body, author_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new ApiError(500, error.message);

  // Author names — 2-step lookup (payroll runs-list pattern; admin client
  // read-only, taake profiles RLS ka jawab deterministic rahe)
  const authorIds = [...new Set((rows ?? []).map((r) => r.author_id).filter(Boolean))];
  let authorsById = new Map();
  if (authorIds.length > 0) {
    const { data: authors } = await admin
      .from("hcm_profiles")
      .select("id, full_name, role")
      .in("id", authorIds);
    authorsById = new Map((authors ?? []).map((a) => [a.id, a]));
  }

  const items = (rows ?? []).map((r) => {
    const author = authorsById.get(r.author_id);
    return {
      ...r,
      author: author
        ? { full_name: author.full_name, role: author.role }
        : { full_name: "Unknown", role: null },
      canDelete:
        profile.role === "admin" ||
        (profile.role === "hr" && r.author_id === profile.id),
    };
  });

  return NextResponse.json({ ok: true, data: items });
});

export const POST = apiHandler(async (request) => {
  const body = postSchema.parse(await request.json());
  const { supabase, profile } = await requireAuth(["admin", "hr"]);
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const { data: created, error } = await supabase
    .from("hcm_announcements")
    .insert({
      title: body.title,
      body: body.body,
      author_id: profile.id,
    })
    .select("id, title, body, author_id, created_at")
    .single();
  if (error) throw new ApiError(500, error.message);

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: "announcement.create",
    entity: "hcm_announcements",
    entityId: created.id,
    after: { title: created.title },
  });

  // Fan-out: sab active logins ko notify (author khud skip).
  // Admin client — profiles RLS session-client par sirf own row deti hai.
  const { data: activeUsers } = await admin
    .from("hcm_profiles")
    .select("id")
    .eq("is_active", true)
    .neq("id", profile.id);
  const notified = await notifyMany((activeUsers ?? []).map((u) => u.id), {
    title: `Announcement — ${created.title}`,
    body: `${profile.full_name} posted a company announcement.`,
    link: "/announcements",
  });

  return NextResponse.json(
    { ok: true, data: { ...created, notified } },
    { status: 201 }
  );
});
