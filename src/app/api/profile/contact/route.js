import { NextResponse } from "next/server";
import { z } from "zod";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";

/**
 * POST /api/profile/contact — Employee apna phone/address update karta hai (F06).
 * DB RPC (hcm_update_my_contact) use hota hai — employee direct row update
 * nahi kar sakta (salary/status tampering impossible).
 */
const schema = z.object({
  phone: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
});

export const POST = apiHandler(async (request) => {
  const body = schema.parse(await request.json());
  const { supabase, user, profile } = await requireAuth();

  if (!profile.employee_id) {
    throw new ApiError(
      422,
      "No employee record is linked to this account (Admin/HR edit their details from the directory)."
    );
  }

  const { error } = await supabase.rpc("hcm_update_my_contact", {
    p_phone: body.phone ?? null,
    p_address: body.address ?? null,
  });

  if (error) {
    throw new ApiError(422, error.message);
  }

  await writeAudit({
    actorId: user.id,
    actorRole: profile.role,
    action: "update_own_contact",
    entity: "hcm_employees",
    entityId: profile.employee_id,
  });

  return NextResponse.json({ ok: true });
});
