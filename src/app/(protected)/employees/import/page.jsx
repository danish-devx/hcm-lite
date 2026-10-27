import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { ImportClient } from "./import-client";

export const metadata = { title: "Import Employees — Bloom" };

export default async function ImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!["admin", "hr"].includes(session.profile.role)) redirect("/dashboard");

  return <ImportClient />;
}
