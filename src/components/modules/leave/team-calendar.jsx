"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

import { monthTitle } from "@/components/modules/leave/leave-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useGetLeaveCalendarQuery } from "@/store/api/leaveApi";

/**
 * Team leave calendar (M5 staff) — month grid, har working day par
 * kaun on-leave (approved = solid, pending = dashed). Weekend/holiday washes.
 */

function shiftMonth(monthStr, delta) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function TeamLeaveCalendar({ initialMonth }) {
  const [month, setMonth] = React.useState(initialMonth);
  const { data, isLoading } = useGetLeaveCalendarQuery(month);

  // data aane ke baad initialMonth sync (me load hone tak dialog/panel hold)
  React.useEffect(() => {
    if (!initialMonth) return undefined;
    const t = window.setTimeout(() => setMonth(initialMonth), 0);
    return () => window.clearTimeout(t);
  }, [initialMonth]);

  const year = Number(month.slice(0, 4));
  const monthIdx = Number(month.slice(5, 7)) - 1;
  const firstDow = new Date(Date.UTC(year, monthIdx, 1)).getUTCDay(); // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

  const weekendSet = new Set((data?.weekendDays ?? [0, 6]).map(Number));
  const holidayMap = new Map((data?.holidays ?? []).map((h) => [h.date, h.name]));
  const byDay = data?.byDay ?? {};

  const cells = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${month}-${String(d).padStart(2, "0")}`);
  }

  const approvedCount = Object.values(byDay).reduce(
    (s, arr) => s + arr.filter((x) => x.status === "approved").length,
    0
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-primary" /> Team leave calendar
            </CardTitle>
            <CardDescription>
              Kaun kab off-par hai — approved solid, pending dotted. {approvedCount > 0 ? `${approvedCount} approved day-entries is month me.` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="size-8 rounded-full" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-36 text-center font-display text-sm font-medium">
              {monthTitle(month)}
            </span>
            <Button variant="outline" size="icon" className="size-8 rounded-full" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1.5">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {d}
                </div>
              ))}
              {cells.map((date, i) => {
                if (!date) return <div key={`pad-${i}`} />;
                const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
                const isWeekend = weekendSet.has(dow);
                const holiday = holidayMap.get(date);
                const entries = byDay[date] ?? [];
                const isToday = date === data?.today;
                const hasApproved = entries.some((e) => e.status === "approved");
                const hasPending = entries.some((e) => e.status === "pending");

                return (
                  <TooltipProvider key={date} delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex min-h-16 flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors",
                            isWeekend || holiday ? "bg-muted/50 text-muted-foreground" : "bg-background",
                            isToday && "border-primary",
                            entries.length > 0 && !isWeekend && !holiday && "cursor-default"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className={cn("text-xs tabular", (isWeekend || holiday) && "text-muted-foreground/70")}>
                              {Number(date.slice(8))}
                            </span>
                            {hasApproved ? (
                              <span className="size-1.5 rounded-full bg-success" />
                            ) : hasPending ? (
                              <span className="size-1.5 rounded-full bg-warning" />
                            ) : null}
                          </div>
                          {holiday ? (
                            <span className="truncate text-[9px] leading-tight text-muted-foreground/80">{holiday}</span>
                          ) : null}
                          {entries.slice(0, 2).map((e) => (
                            <span
                              key={`${date}-${e.requestId}`}
                              className={cn(
                                "truncate rounded px-1 py-0.5 text-[9px] leading-tight",
                                e.status === "approved"
                                  ? "bg-info/15 text-info"
                                  : "border border-dashed border-warning/50 text-warning"
                              )}
                            >
                              {e.name?.split(" ")[0]}
                            </span>
                          ))}
                          {entries.length > 2 ? (
                            <span className="px-1 text-[9px] text-muted-foreground">+{entries.length - 2} more</span>
                          ) : null}
                        </div>
                      </TooltipTrigger>
                      {entries.length > 0 ? (
                        <TooltipContent side="top" className="max-w-60">
                          <p className="mb-1 text-[11px] font-medium">{date}</p>
                          {entries.map((e) => (
                            <p key={`tt-${date}-${e.requestId}`} className="text-[11px]">
                              <span className="font-medium">{e.name}</span> — {e.typeName} ({e.status})
                            </p>
                          ))}
                        </TooltipContent>
                      ) : null}
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success" /> Approved
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warning" /> Pending
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Badge variant="outline" className="h-4 px-1.5 text-[9px]">wash</Badge> weekend / holiday
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
