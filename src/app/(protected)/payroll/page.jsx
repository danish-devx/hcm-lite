import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { PayrollClient } from "@/components/modules/payroll/payroll-client";

export const metadata = { title: "Payroll — Bloom" };

export default async function PayrollPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <PayrollClient role={session.profile.role} />;
}
