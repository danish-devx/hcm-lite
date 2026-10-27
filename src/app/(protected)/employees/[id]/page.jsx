import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { Employee360Client } from "./employee-360-client";

export const metadata = { title: "Employee 360 — Bloom" };

export default async function EmployeePage({ params }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["admin", "hr"].includes(session.profile.role)) redirect("/dashboard");

  const { id } = await params;
  return <Employee360Client employeeId={id} />;
}
