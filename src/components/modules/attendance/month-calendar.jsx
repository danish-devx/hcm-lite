"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_STYLES, STATUS_LABELS } from "./attendance-bits";

/**
 * Month calendar (M4) — employee apna attendance month view.
 * Ivory Bloom editorial grid: weekday hairlines + soft status washes.
 * Data /api/attendance/me se aata hai (server-tz "today" tak).
 */

const WEEK_HEAD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const CELL_WASH = {
  present: "bg-success/12 text-foreground",
  late: "bg-warning/15 text-foreground",
  half_day: "bg-info/12 text-foreground",
  missing_checkout: "bg-warning/10 text-foreground",
  absent: "bg-destructive/10 text-destructive",
  on_leave: "bg-info/10 text-info",
  weekend: "bg-muted/60 text-muted-foreground",
  holiday: "bg-muted/60 text-muted-foreground",
  not_checked_in: "bg-transparent text-muted-foreground",
};

function monthLabel(from) {
  try {
    return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${from}T00:00:00Z`)
    );
  } catch {
    return from;
  }
}

export function MonthCalendar({ me }) {
  const days = me?.month?.days ?? [];
  const from = me?.month?.from;
  const today = me?.today;

  const grid = React.useMemo(() => {
    if (!from || days.length === 0) return [];
    const first = new Date(`${from}T00:00:00Z`);
    const lead = first.getUTCDay(); // Sunday-start grid
    const cells = [];
    for (let i = 0; i < lead; i += 1) cells.push(null);
    days.forEach((d) => cells.push(d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [from, days]);

  const stats = me?.stats ?? {};
  const legendOrder = ["present", "late", "half_day", "on_leave", "absent", "missing_checkout"];
  const legend = legendOrder.filter((s) => (stats[s] ?? 0) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          {monthLabel(from)}
        </CardTitle>
        <CardDescription>Your attendance month-to-date — server-computed statuses.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEK_HEAD.map((w) => (
            <div key={w} className="micro-label pb-1 text-center text-[10px]">
              {w}
            </div>
          ))}
          {grid.map((cell, i) =>
            cell ? (
              <div
                key={cell.date}
                title={`${cell.date} — ${STATUS_LABELS[cell.status] ?? cell.status}`}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-xs tabular transition-colors ${
                  CELL_WASH[cell.status] ?? ""
                } ${cell.date === today ? "border-primary ring-1 ring-primary/40" : "border-border/60"}`}
              >
                <span className="font-medium">{Number(cell.date.slice(8, 10))}</span>
                <span className="text-[9px] leading-none opacity-70">
                  {STATUS_LABELS[cell.status]?.split(" ")[0] ?? ""}
                </span>
              </div>
            ) : (
              <div key={`pad-${i}`} className="aspect-square rounded-lg" />
            )
          )}
        </div>

        {/* Legend + stats */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-[11px] text-muted-foreground">
          {legend.length === 0 ? (
            <span>No attendance recorded yet this month.</span>
          ) : (
            legend.map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`size-2.5 rounded-full border ${STATUS_STYLES[s]}`} />
                {STATUS_LABELS[s]} <span className="tabular font-medium text-foreground">{stats[s]}</span>
              </span>
            ))
          )}
          {stats.avg_check_in ? (
            <span className="ml-auto">
              Avg check-in <span className="tabular font-medium text-foreground">{stats.avg_check_in}</span>
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
