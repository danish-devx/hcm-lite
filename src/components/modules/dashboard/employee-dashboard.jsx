"use client";

import * as React from "react";
import Link from "next/link";
import { Banknote, CalendarCheck2, Clock3, Plane, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckInCard } from "@/components/modules/attendance/check-in-card";
import { BalanceBar, longDate, monthTitle } from "@/components/modules/leave/leave-bits";
import { useGetMyAttendanceQuery } from "@/store/api/attendanceApi";
import { useGetMyDashboardQuery } from "@/store/api/dashboardApi";
import { useChartTheme, BarsChart } from "./chart-kit";
import { ChartCard, EmptyPanel, MiniBar, StatCard, compactMoney, fmtHoursLabel } from "./dash-bits";

/**
 * Employee personal dashboard (M7) — check-in widget (M4 reuse) · hours this
 * week vs 40 h · late count · leave balance · last payslip · next approved
 * leave. Sab apna data — /api/dashboard/me employee-scope serve karta hai.
 */

function dayLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(d);
}

export function EmployeeDashboard() {
  const theme = useChartTheme();
  const { data, isLoading, isError } = useGetMyDashboardQuery();
  const { data: me } = useGetMyAttendanceQuery();

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return <EmptyPanel title="Dashboard could not load" hint="Refresh the page — analytics server se compute hoti hai." />;
  }

  if (!data.linked) {
    return (
      <EmptyPanel
        title="No employee profile linked"
        hint="Ye login kisi employee record se linked nahi. HR se apna employee record link karwayein ya admin dashboard use karein."
      />
    );
  }

  const { week, lateCount, balances, lastPayslip, nextLeave, pendingLeave } = data;
  const totalBalances = balances.filter((b) => b.quota != null);
  const remainingTotal = totalBalances.reduce((s, b) => s + (b.remaining ?? 0), 0);
  const topBalance = [...totalBalances].sort((a, b) => (a.remaining ?? 0) - (b.remaining ?? 0))[0];
  const weekPct = week.targetMinutes ? (week.workedMinutes / week.targetMinutes) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Personal KPIs — brief: hours this week vs 40h · late count · leave left · last payslip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Hours this week"
          value={fmtHoursLabel(week.workedMinutes)}
          sub={`of 40 h target · ${Math.round(weekPct)}%`}
          icon={Clock3}
          foot={<MiniBar pct={weekPct} className="mt-3" />}
        />
        <StatCard
          label="Late this month"
          value={String(lateCount)}
          sub={lateCount ? "Server-stamped lates" : "All on time so far"}
          icon={Clock3}
        />
        <StatCard
          label="Leave remaining"
          value={String(remainingTotal)}
          sub={topBalance ? `${topBalance.name}: ${topBalance.remaining}/${topBalance.quota}` : "No quota types"}
          icon={Plane}
        />
        <StatCard
          label="Last payslip"
          value={lastPayslip ? compactMoney(lastPayslip.net) : "—"}
          sub={lastPayslip ? `${monthTitle(lastPayslip.month)} · finalized` : "No finalized payroll yet"}
          icon={Banknote}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Check-in widget — M4 reuse (live clock + GPS + server stamps) */}
        <div className="space-y-2">
          <CheckInCard me={me} />
        </div>

        {/* Hours by day */}
        <ChartCard title="Hours by day" caption={`${longDate(week.from)} → ${longDate(week.to)}`}>
          <BarsChart
            labels={week.byDay.map((d) => dayLabel(d.date))}
            datasets={[
              {
                label: "Worked",
                data: week.byDay.map((d) => Math.round((d.minutes / 60) * 10) / 10),
                backgroundColor: week.byDay.map((d) =>
                  d.minutes > 0 ? theme.series[0] : theme.series[4]
                ),
                borderRadius: 8,
                maxBarThickness: 30,
              },
            ]}
            theme={theme}
            height={220}
            suffix="h"
            yCompact={(v) => `${Math.round(v)}h`}
          />
          <p className="mt-3 text-[11px] text-muted-foreground">
            Target 40 h/week · aaj{" "}
            {week.workedMinutes >= week.targetMinutes
              ? "target complete ho gaya hai"
              : `${fmtHoursLabel(Math.max(0, week.targetMinutes - week.workedMinutes))} baaki hain`}
            .
          </p>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Leave balances — same numbers as My Leave page */}
        <ChartCard title="My leave balances" caption={`${new Date().getFullYear()} quotas`}>
          {balances.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {balances.map((b) => (
                <div key={b.typeId} className="rounded-lg border bg-background/40 p-3.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium">{b.typeName}</p>
                    {b.quota == null ? (
                      <Badge variant="outline" className="text-[10px]">
                        Unlimited
                      </Badge>
                    ) : null}
                  </div>
                  <BalanceBar balance={b} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel title="No leave types" hint="Admin ne abhi leave types configure nahi kiye." />
          )}
          {pendingLeave > 0 ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {pendingLeave} request{pendingLeave > 1 ? "s" : ""} pending approval —{" "}
              <Link href="/leave" className="underline underline-offset-2">
                track in My Leave
              </Link>
            </p>
          ) : null}
        </ChartCard>

        {/* Next leave + payslip shortcuts */}
        <div className="space-y-4">
          <ChartCard title="Upcoming & rewards" caption="Your timeline">
            <div className="space-y-3">
              {nextLeave ? (
                <div className="flex items-center gap-3 rounded-lg border bg-background/40 px-4 py-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CalendarCheck2 className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {nextLeave.typeName ?? "Leave"} · {longDate(nextLeave.start)}
                      {nextLeave.end !== nextLeave.start ? ` → ${longDate(nextLeave.end)}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Approved · {nextLeave.days} working day{nextLeave.days > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed px-4 py-4 text-center text-xs text-muted-foreground">
                  Koi upcoming approved leave nahi.
                </div>
              )}

              {lastPayslip ? (
                <div className="flex items-center gap-3 rounded-lg border bg-background/40 px-4 py-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Banknote className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{monthTitle(lastPayslip.month)} payslip ready</p>
                    <p className="text-[11px] text-muted-foreground tabular">
                      Net {compactMoney(lastPayslip.net)} · deductions {compactMoney(lastPayslip.deductions)}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="h-8 rounded-full px-3 text-xs">
                    <Link href="/payroll">Open</Link>
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed px-4 py-4 text-center text-xs text-muted-foreground">
                  Pehla payroll finalize hone par payslip yahan +{" "}
                  <Link href="/payroll" className="underline underline-offset-2">
                    My Payslips
                  </Link>{" "}
                  me milega.
                </div>
              )}

              {/* Ask my assistant — brief M7 employee dashboard element (F19) */}
              <Link
                href="/assistant"
                className="flex items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10"
              >
                <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Ask my assistant</p>
                  <p className="text-[11px] text-muted-foreground">
                    “How many sick leaves do I have left?” — plain words me poochein
                  </p>
                </div>
              </Link>
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
