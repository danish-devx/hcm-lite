"use client";

import * as React from "react";
import { CalendarCheck2, History, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ApprovalInbox } from "@/components/modules/leave/approval-inbox";
import { MyLeaveCard } from "@/components/modules/leave/my-leave-card";
import { RequestsBrowser } from "@/components/modules/leave/requests-browser";
import { TeamLeaveCalendar } from "@/components/modules/leave/team-calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useGetLeaveRequestsQuery,
  useGetMyLeaveQuery,
} from "@/store/api/leaveApi";

/**
 * /leave — role-aware (M5):
 *  - employee: balances + apply + meri requests
 *  - admin/hr: Approval inbox | Team calendar | All requests (tabs) +
 *    apna "My leave" section agar login linked ho
 */

function TabButton({ active, onClick, icon: Icon, children, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {children}
      {badge ? (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] tabular",
            active ? "bg-primary-foreground/20" : "bg-warning/15 text-warning"
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function LeaveClient({ role }) {
  const isStaff = role === "admin" || role === "hr";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        index="05"
        eyebrow={`Leave · ${isStaff ? "Team" : "Self-service"}`}
        title={isStaff ? "Leave management" : "My leave"}
        description={
          isStaff
            ? "Approval inbox, team calendar aur poori history — balance aur overlap rules server par enforce hote hain."
            : "Balance check karein, leave apply karein aur apni requests ka status dekhein — working days me weekends aur holidays count nahi hote."
        }
      />
      {isStaff ? <StaffLeaveBody /> : <EmployeeLeaveBody />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee self-service
// ---------------------------------------------------------------------------

function EmployeeLeaveBody() {
  const { data: me, isLoading } = useGetMyLeaveQuery();

  if (isLoading || !me) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  return <MyLeaveCard me={me} />;
}

// ---------------------------------------------------------------------------
// Staff: inbox + calendar + history
// ---------------------------------------------------------------------------

function StaffLeaveBody() {
  const { data: me, isLoading: meLoading } = useGetMyLeaveQuery();
  const { data: inbox, isLoading: inboxLoading } = useGetLeaveRequestsQuery({ page: 1 });
  const [tab, setTab] = React.useState("inbox");

  const pendingCount = (inbox?.rows ?? []).filter((r) => r.status === "pending").length;
  const tz = me?.timezone ?? "Asia/Karachi";
  const currentMonth = me?.today?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);

  if (meLoading || !me) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-72 rounded-full" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <TabButton
          active={tab === "inbox"}
          onClick={() => setTab("inbox")}
          icon={CalendarCheck2}
          badge={pendingCount > 0 ? pendingCount : null}
        >
          Approval inbox
        </TabButton>
        <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")} icon={Users}>
          Team calendar
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")} icon={History}>
          All requests
        </TabButton>
      </div>

      {tab === "inbox" ? (
        <ApprovalInbox rows={inbox?.rows ?? []} isLoading={inboxLoading} tz={tz} />
      ) : tab === "calendar" ? (
        <TeamLeaveCalendar initialMonth={currentMonth} />
      ) : (
        <RequestsBrowser leaveTypes={me.leaveTypes ?? []} tz={tz} />
      )}

      {/* Linked staff — apna leave bhi */}
      {me.linked ? (
        <div className="space-y-4 border-t pt-6">
          <p className="micro-label">My own leave</p>
          <MyLeaveCard me={me} title="My leave" />
        </div>
      ) : null}
    </>
  );
}
