import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { DepartmentsClient } from "./departments-client";

export const metadata = { title: "Departments — Bloom" };

export default async function DepartmentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "admin") redirect("/dashboard");

  return <DepartmentsClient />;
}
