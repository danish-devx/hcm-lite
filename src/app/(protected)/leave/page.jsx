import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { LeaveClient } from "@/components/modules/leave/leave-client";

export const metadata = { title: "Leave — Bloom" };

export default async function LeavePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <LeaveClient role={session.profile.role} />;
}
