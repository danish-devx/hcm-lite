"use client";

import * as React from "react";
import { CalendarCheck2, LayoutList } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { CheckInCard } from "@/components/modules/attendance/check-in-card";
import { CorrectionsCard } from "@/components/modules/attendance/corrections-card";
import { MonthCalendar } from "@/components/modules/attendance/month-calendar";
import { RecordsBrowser } from "@/components/modules/attendance/records-browser";
import { StaffAttendanceBoard } from "@/components/modules/attendance/staff-board";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useGetMyAttendanceQuery } from "@/store/api/attendanceApi";

/**
 * /attendance — role-aware (M4):
 *  - Sab roles: agar login employee-record se linked hai → "My day" (check-in
 *    hero, month calendar, corrections)
 *  - admin/hr: upar Daily Board + Records (tabs); employee: sirf self-service
 */

function TabButton({ active, onClick, icon: Icon, children }) {
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
    </button>
  );
}

export function AttendanceClient({ role }) {
  const isStaff = role === "admin" || role === "hr";
  const { data: me, isLoading } = useGetMyAttendanceQuery();
  const [tab, setTab] = React.useState("board");

  const linked = Boolean(me?.linked);
  const tz = me?.timezone ?? "Asia/Karachi";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        index="04"
        eyebrow={`Attendance · ${isStaff ? "Team" : "Self-service"}`}
        title={isStaff ? "Attendance" : "My attendance"}
        description={
          isStaff
            ? `Daily board, live punches aur corrections — ${tz} time, server-stamped.`
            : `Check in, check out, apna month review karein — ${tz} time, server-stamped punches.`
        }
      />

      {isStaff ? (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <TabButton active={tab === "board"} onClick={() => setTab("board")} icon={CalendarCheck2}>
              Daily board
            </TabButton>
            <TabButton active={tab === "records"} onClick={() => setTab("records")} icon={LayoutList}>
              Records
            </TabButton>
          </div>

          {tab === "board" ? (
            <StaffAttendanceBoard todayIso={me?.today} />
          ) : (
            <RecordsBrowser todayIso={me?.today} />
          )}

          {/* Staff login with employee link — apna section bhi */}
          {linked ? (
            <div className="space-y-4 border-t pt-6">
              <p className="micro-label">My day</p>
              <div className="grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  <MonthCalendar me={me} />
                </div>
                <div className="lg:col-span-2">
                  <CorrectionsCard me={me} role={role} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : linked ? (
        <div className="space-y-4">
          <CheckInCard me={me} />
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <MonthCalendar me={me} />
            </div>
            <div className="lg:col-span-2">
              <CorrectionsCard me={me} role={role} />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-display text-lg">No employee record linked</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Ye login kisi employee record se linked nahi — attendance sirf linked logon ke liye hai. HR se apna record
            link karwayein.
          </p>
        </div>
      )}
    </div>
  );
}
