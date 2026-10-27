import { redirect } from "next/navigation";

import { getSession } from "@/lib/guards";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function ProtectedLayout({ children }) {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.profile.must_change_password) redirect("/change-password");

  const { profile, employee } = session;

  return (
    <div className="flex min-h-svh w-full">
      <AppSidebar profile={profile} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar profile={profile} employee={employee} />
        <main className="flex-1 px-4 py-5 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
