import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { AttendanceClient } from "./attendance-client";

export const metadata = { title: "Attendance — Bloom" };

export default async function AttendancePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <AttendanceClient role={session.profile.role} />;
}
