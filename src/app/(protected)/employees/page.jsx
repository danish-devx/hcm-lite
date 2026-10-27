import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { EmployeesClient } from "./employees-client";

export const metadata = { title: "Employees — Bloom" };

export default async function EmployeesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["admin", "hr"].includes(session.profile.role)) redirect("/dashboard");

  return <EmployeesClient />;
}
