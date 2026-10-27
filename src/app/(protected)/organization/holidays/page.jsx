import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { HolidaysClient } from "./holidays-client";

export const metadata = { title: "Holidays — Bloom" };

export default async function HolidaysPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "admin") redirect("/dashboard");

  return <HolidaysClient />;
}
