import { NextResponse } from "next/server";

import { apiHandler, requireAuth } from "@/lib/guards";

export const GET = apiHandler(async () => {
  const { user, profile, employee } = await requireAuth();

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile,
    employee,
  });
});
