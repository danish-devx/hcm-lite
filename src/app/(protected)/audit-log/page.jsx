import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { AuditLogClient } from "@/components/modules/comms/audit-log-client";

export const metadata = { title: "Audit Log — Bloom" };

export default async function AuditLogPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "admin") redirect("/dashboard");

  return <AuditLogClient />;
}
