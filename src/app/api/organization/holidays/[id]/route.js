import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * PATCH  /api/organization/holidays/[id] — admin-only update
 * DELETE /api/organization/holidays/[id] — admin-only delete
 */

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const patchSchema = z.object({
  date: z.string().regex(dateRegex, "Pick a valid date").optional(),
  name: z.string().trim().min(2).max(80).optional(),
});

export const PATCH = apiHandler(async (request, context) => {
  const { id } = await context.params;
  const body = patchSchema.parse(await request.json());
  const { supabase, user, profile } = await requireAuth(["admin"]);

  if (body.date) {
    const { data: dup } = await supabase
      .from("hcm_holidays")
      .select("id")
      .eq("date", body.date)
      .neq("id", id)
      .maybeSingle();
    if (dup) throw new ApiError(409, "A holiday already exists on this date.");
  }

  const update = {};
  if (body.date !== undefined) update.date = body.date;
  if (body.name !== undefined) update.name = body.name;

  const { data: before } = await supabase
    .from("hcm_holidays")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) throw new ApiError(404, "Holiday not found.");

  const { data, error } = await supabase
    .from("hcm_holidays")
    .update(update)
    .eq("id", id)
    .select("id, date, name, created_at")
    .single();

  if (error) throw new ApiError(500, error.message);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "holiday_update",
    entity: "hcm_holidays",
    entityId: id,
    before,
    after: data,
  });

  return NextResponse.json({ ok: true, data });
});

export const DELETE = apiHandler(async (request, context) => {
  const { id } = await context.params;
  const { supabase, user, profile } = await requireAuth(["admin"]);

  const { data: before } = await supabase
    .from("hcm_holidays")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) throw new ApiError(404, "Holiday not found.");

  const { error } = await supabase.from("hcm_holidays").delete().eq("id", id);

  if (error) throw new ApiError(500, error.message);

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "holiday_delete",
    entity: "hcm_holidays",
    entityId: id,
    before,
  });

  return NextResponse.json({ ok: true });
});
