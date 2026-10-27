import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { DesignationsClient } from "./designations-client";

export const metadata = { title: "Designations — Bloom" };

export default async function DesignationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "admin") redirect("/dashboard");

  return <DesignationsClient />;
}
