import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Company Settings — Bloom" };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "admin") redirect("/dashboard");

  return <SettingsClient />;
}
