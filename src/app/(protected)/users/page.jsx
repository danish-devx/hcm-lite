import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { UsersClient } from "./users-client";

export const metadata = { title: "Users & Logins — Bloom" };

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "admin") redirect("/dashboard");

  return <UsersClient currentUserId={session.user.id} />;
}
