import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { AnnouncementsClient } from "@/components/modules/comms/announcements-client";

export const metadata = { title: "Announcements — Bloom" };

export default async function AnnouncementsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <AnnouncementsClient role={session.profile.role} />;
}
