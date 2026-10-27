"use client";

import * as React from "react";
import { CalendarX2, Clock3, Inbox, ShieldCheck, UserCheck, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useGetHrDashboardQuery } from "@/store/api/dashboardApi";
import { AiSummaryCard } from "@/components/modules/ai/ai-summary-card";
import { useChartTheme, BarsChart, DonutChart, TrendLine, withAlpha } from "./chart-kit";
import { ChartCard, EmptyPanel, StatCard } from "./dash-bits";

/**
 * HR insights dashboard (M7) — headcount, present, on leave, late today,
 * pending approvals · attendance trend · absenteeism by dept · leave by type ·
 * top 5 late-comers. Data /api/dashboard/hr se (server aggregation).
 */

function dayLabel(dateStr) {
  const [, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, m - 1, 1))
  ) + ` ${d}`;
}

export function HrDashboard({ filters, ready }) {
  const theme = useChartTheme();
  const { data, isLoading, isError } = useGetHrDashboardQuery(filters, { skip: !ready });

  if (!ready || isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return <EmptyPanel title="Dashboard could not load" hint="Refresh the page — analytics server se compute hoti hai." />;
  }

  const { kpis, trend, totals, absenteeismByDept, leaveByType, topLateComers, anomalies, anomalySummary, isWorkingDayToday } = data;
  const noPeople = kpis.headcount === 0;
  const todayLine = trend.find((t) => t.date === data.today);

  return (
    <div className="space-y-4">
      {/* KPI row — brief: headcount, present, on leave, late today, pending approvals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Headcount" value={kpis.headcount.toLocaleString("en-US")} sub="Active employees" icon={Users} />
        <StatCard
          label={isWorkingDayToday ? "Present today" : "Working day off"}
          value={isWorkingDayToday ? kpis.present.toLocaleString("en-US") : "—"}
          sub={isWorkingDayToday ? "Checked in" : "Weekend / holiday"}
          icon={UserCheck}
        />
        <StatCard
          label="On leave today"
          value={kpis.onLeave.toLocaleString("en-US")}
          sub={kpis.notCheckedIn > 0 ? `${kpis.notCheckedIn} not checked in yet` : "Approved leaves"}
          icon={CalendarX2}
        />
        <StatCard
          label="Late today"
          value={kpis.late.toLocaleString("en-US")}
          sub={`Range late rate ${kpis.latePct}%`}
          icon={Clock3}
        />
        <StatCard
          label="Pending approvals"
          value={kpis.pendingApprovals.toLocaleString("en-US")}
          sub="Leave + corrections"
          icon={Inbox}
        />
      </div>

      {/* AI summary (F20) — current filters ke KPI JSON par bullets */}
      <AiSummaryCard dashboard="hr" data={data} filters={filters} />

      {noPeople ? (
        <EmptyPanel
          title="Insights start with your team"
          hint="HR employees register karein — check-ins aur leaves ke saath yahan attendance trend, absenteeism, leave utilization aur late-comers live ban jayenge."
        />
      ) : (
        <>
          {/* Attendance trend — brief: attendance trend */}
          <ChartCard
            title="Attendance trend"
            caption={`${data.range.from} → ${data.range.to} · rate ${kpis.attendanceRate}%`}
          >
            {trend.length ? (
              <TrendLine
                labels={trend.map((t) => dayLabel(t.date))}
                datasets={[
                  {
                    label: "Present",
                    data: trend.map((t) => t.present),
                    borderColor: theme.series[0],
                    backgroundColor: withAlpha(theme.series[0], 0.14),
                    fill: true,
                    tension: 0.35,
                  },
                  {
                    label: "Late",
                    data: trend.map((t) => t.late),
                    borderColor: theme.series[2],
                    tension: 0.35,
                  },
                  {
                    label: "Absent",
                    data: trend.map((t) => t.absent),
                    borderColor: theme.series[1],
                    borderDash: [5, 4],
                    tension: 0.35,
                  },
                  {
                    label: "On leave",
                    data: trend.map((t) => t.on_leave),
                    borderColor: theme.series[3],
                    tension: 0.35,
                  },
                ]}
                theme={theme}
                height={280}
                yCompact={(v) => String(Math.round(v))}
              />
            ) : (
              <EmptyPanel title="No working days in range" hint="Range adjust karein — trend sirf working days par banta hai." />
            )}
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Absenteeism by dept */}
            <ChartCard title="Absenteeism by department" caption="Absent % · late % of range">
              {absenteeismByDept.length ? (
                <BarsChart
                  labels={absenteeismByDept.map((d) => d.name)}
                  datasets={[
                    {
                      label: "Absent %",
                      data: absenteeismByDept.map((d) => d.absentPct),
                      backgroundColor: theme.series[1],
                      borderRadius: 8,
                      maxBarThickness: 30,
                    },
                    {
                      label: "Late %",
                      data: absenteeismByDept.map((d) => d.latePct),
                      backgroundColor: withAlpha(theme.series[2], 0.75),
                      borderRadius: 8,
                      maxBarThickness: 30,
                    },
                  ]}
                  theme={theme}
                  height={240}
                  suffix="%"
                  yCompact={(v) => `${Math.round(v)}%`}
                />
              ) : (
                <EmptyPanel title="No departments with data" hint="Employees ko departments assign karein." />
              )}
            </ChartCard>

            {/* Leave by type — utilization */}
            <ChartCard title="Leave utilization by type" caption="Approved days ÷ quota (range)">
              {leaveByType.some((t) => t.approvedDays + t.pendingDays > 0) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <DonutChart
                    labels={leaveByType.filter((t) => t.approvedDays > 0).map((t) => t.name)}
                    values={leaveByType.filter((t) => t.approvedDays > 0).map((t) => t.approvedDays)}
                    theme={theme}
                    height={200}
                    suffix=" d"
                  />
                  <div className="space-y-2.5">
                    {leaveByType.map((t) => (
                      <div key={t.code} className="border-b border-dashed pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs">{t.name}</p>
                          <p className="text-[11px] text-muted-foreground tabular">
                            {t.approvedDays}d{t.pendingDays ? ` · ${t.pendingDays}d pending` : ""}
                          </p>
                        </div>
                        {t.quotaTotal != null ? (
                          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.min(100, t.utilization ?? 0)}%` }}
                            />
                          </div>
                        ) : (
                          <p className="mt-1 text-[10px] text-muted-foreground">Unlimited quota</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyPanel title="No leave taken in range" hint="Approved leave requests yahan type-wise utilization banayengi." />
              )}
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top late-comers — brief insight list */}
            <ChartCard title="Top late-comers" caption="Range · by late count">
              {topLateComers.length ? (
                <div className="space-y-3">
                  {topLateComers.map((p, i) => (
                    <div key={p.employeeId} className="flex items-center gap-3 border-b border-dashed pb-2.5 last:border-0 last:pb-0">
                      <span className="font-display text-sm italic text-primary tabular">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{p.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {p.code} · {p.dept}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium tabular">{p.lateCount}×</p>
                        {p.avgCheckIn ? (
                          <p className="text-[11px] text-muted-foreground tabular">avg {p.avgCheckIn}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel title="No late check-ins" hint="Range me koi late record nahi — team on time hai." />
              )}
            </ChartCard>

            {/* Absence anomalies — bonus feature: pattern flags */}
            <ChartCard
              title="Absence anomaly flags"
              caption={`Company absence ${anomalySummary?.companyAbsentPct ?? 0}% · ${anomalySummary?.flagged ?? 0} flagged`}
            >
              {anomalies?.length ? (
                <div className="space-y-3">
                  {anomalies.map((a) => (
                    <div key={a.employeeId} className="border-b border-dashed pb-2.5 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</p>
                        <Badge variant="outline" className="shrink-0 text-[10px] tabular">
                          {a.absentCount}d · {a.absentPct}%
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.flags.map((f) => (
                          <span
                            key={f.code}
                            className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning"
                          >
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center">
                  <ShieldCheck className="size-4 text-success" />
                  <p className="text-xs text-muted-foreground">
                    No absence patterns flagged — koi streak, 2× average ya Monday/Friday cluster nahi.
                  </p>
                </div>
              )}
            </ChartCard>

            {/* Range snapshot — totals strip */}
            <ChartCard title="Range snapshot" caption="Person-days">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ["Present", totals.present],
                  ["Late", totals.late],
                  ["Half day", totals.half_day],
                  ["Missing checkout", totals.missing_checkout],
                  ["Absent", totals.absent],
                  ["On leave", totals.on_leave],
                ].map(([label, v]) => (
                  <div key={label} className="rounded-lg border bg-background/40 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="mt-1 font-display text-xl tabular">{Math.round(Number(v) * 10) / 10}</p>
                  </div>
                ))}
              </div>
              {todayLine ? (
                <p className="mt-4 text-[11px] text-muted-foreground">
                  Today ({dayLabel(todayLine.date)}): {todayLine.present} present · {todayLine.late} late ·{" "}
                  {todayLine.on_leave} on leave{todayLine.absent ? ` · ${todayLine.absent} absent` : ""}
                </p>
              ) : null}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
