import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { LeaveTypesClient } from "./leave-types-client";

export const metadata = { title: "Leave Types — Bloom" };

export default async function LeaveTypesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "admin") redirect("/dashboard");

  return <LeaveTypesClient />;
}
