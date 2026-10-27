"use client";

import * as React from "react";
import {
  ArrowDownRight,
  Banknote,
  CircleDollarSign,
  ScrollText,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AiSummaryCard } from "@/components/modules/ai/ai-summary-card";
import { useGetAdminDashboardQuery } from "@/store/api/dashboardApi";
import { useChartTheme, BarsChart, DonutChart, TrendLine, withAlpha } from "./chart-kit";
import { ChartCard, EmptyPanel, SectionLabel, StatCard, compactMoney, fullMoney } from "./dash-bits";

/**
 * Admin company dashboard (M7) — headcount, attrition YTD, payroll cost,
 * avg salary · headcount by dept · payroll cost by dept · gender & tenure ·
 * audit feed. Sab numbers /api/dashboard/admin se (server aggregation).
 */

const ACTION_LABELS = {
  "payroll.finalize": "Finalized payroll run",
  "payroll.run_create": "Created payroll run",
  "payroll.recalculate": "Recalculated payroll",
  "payroll.run_delete": "Deleted payroll draft",
  "payslip_download": "Payslip downloaded",
  "leave.approved": "Approved leave",
  "leave.rejected": "Rejected leave",
  "leave.apply": "Leave applied",
  "leave.cancel": "Leave cancelled",
  "attendance.correction_request": "Correction requested",
  "attendance.correction_approve": "Correction approved",
  "attendance.correction_reject": "Correction rejected",
  "employee.create": "Employee registered",
  "employee.update": "Employee updated",
  "user.create": "Login created",
  "user.update": "Login updated",
  "settings.update": "Settings changed",
};

function humanAction(action) {
  return ACTION_LABELS[action] ?? action.replaceAll(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeLabel(iso) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function AdminDashboard({ filters, ready }) {
  const theme = useChartTheme();
  const { data, isLoading, isError } = useGetAdminDashboardQuery(filters, { skip: !ready });

  if (!ready || isLoading) {
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

  const { kpis, headcountByDept, payrollByDept, payrollTrend, gender, tenure, avgSalaryByDesignation, attritionRisk, auditFeed } = data;
  const noPeople = kpis.headcount === 0;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Headcount"
          value={kpis.headcount.toLocaleString("en-US")}
          sub={kpis.exits > 0 ? `${kpis.exits} exit${kpis.exits > 1 ? "s" : ""} in range` : "Active employees"}
          icon={Users}
        />
        <StatCard
          label="Attrition (range)"
          value={`${kpis.attritionPct}%`}
          sub={kpis.exits > 0 ? "Exits ÷ average headcount" : "No exits in this range"}
          icon={ArrowDownRight}
        />
        <StatCard
          label="Payroll cost"
          value={compactMoney(kpis.payrollCost)}
          sub={`Net · ${kpis.payrollMonths} finalized month${kpis.payrollMonths === 1 ? "" : "s"}`}
          icon={Banknote}
        />
        <StatCard
          label="Avg salary"
          value={compactMoney(kpis.avgSalaryGross)}
          sub="Gross · 1.5 × basic"
          icon={CircleDollarSign}
        />
      </div>

      {/* AI summary (F20) — current filters ke KPI JSON par bullets */}
      <AiSummaryCard dashboard="admin" data={data} filters={filters} />

      {noPeople && payrollTrend.length === 0 ? (
        <EmptyPanel
          title="Analytics will fill in as your team grows"
          hint="Employees register karein, attendance/leave flow chalne dein aur payroll run finalize karein — yahan headcount, attrition, payroll cost aur salary averages live ban jayenge."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Headcount by department" caption={`${kpis.headcount} active`}>
              {headcountByDept.length ? (
                <BarsChart
                  labels={headcountByDept.map((d) => d.name)}
                  datasets={[
                    {
                      label: "Employees",
                      data: headcountByDept.map((d) => d.count),
                      backgroundColor: theme.series[0],
                      borderRadius: 8,
                      maxBarThickness: 42,
                    },
                  ]}
                  theme={theme}
                  height={240}
                  yCompact={(v) => String(Math.round(v))}
                />
              ) : (
                <EmptyPanel title="No departments yet" hint="Organization me departments banaein aur employees assign karein." />
              )}
            </ChartCard>

            <ChartCard title="Payroll cost by department" caption="Finalized runs · range">
              {payrollByDept.length ? (
                <BarsChart
                  horizontal
                  labels={payrollByDept.map((d) => d.name)}
                  datasets={[
                    {
                      label: "Gross",
                      data: payrollByDept.map((d) => d.gross),
                      backgroundColor: withAlpha(theme.series[2], 0.55),
                      borderRadius: 8,
                      maxBarThickness: 18,
                    },
                    {
                      label: "Net",
                      data: payrollByDept.map((d) => d.net),
                      backgroundColor: theme.series[0],
                      borderRadius: 8,
                      maxBarThickness: 18,
                    },
                  ]}
                  theme={theme}
                  height={240}
                  yCompact={compactMoney}
                />
              ) : (
                <EmptyPanel title="No finalized payroll in range" hint="HR payroll draft banati hai, Admin finalize karta hai — cost yahan aggregate hogi." />
              )}
            </ChartCard>

            <ChartCard title="Payroll trend by month" caption="Gross vs net">
              {payrollTrend.length ? (
                <TrendLine
                  labels={payrollTrend.map((p) => p.month)}
                  datasets={[
                    {
                      label: "Gross",
                      data: payrollTrend.map((p) => p.gross),
                      borderColor: theme.series[2],
                      backgroundColor: withAlpha(theme.series[2], 0.12),
                      fill: true,
                      tension: 0.35,
                    },
                    {
                      label: "Net",
                      data: payrollTrend.map((p) => p.net),
                      borderColor: theme.series[0],
                      tension: 0.35,
                    },
                  ]}
                  theme={theme}
                  height={240}
                  yCompact={compactMoney}
                />
              ) : (
                <EmptyPanel title="No payroll months yet" hint="Pehla run finalize hone par monthly cost trend yahan banega." />
              )}
            </ChartCard>

            <ChartCard title="Gender & tenure" caption="Active employees">
              <div className="grid gap-4 sm:grid-cols-2">
                <DonutChart
                  labels={gender.map((g) => g.label)}
                  values={gender.map((g) => g.count)}
                  theme={theme}
                  height={200}
                  colors={[theme.series[0], theme.series[1], theme.series[2], theme.series[4]]}
                />
                <div className="space-y-2.5">
                  {tenure.map((t) => (
                    <div key={t.key} className="flex items-center justify-between gap-2 border-b border-dashed pb-2 last:border-0">
                      <p className="text-xs text-muted-foreground">{t.label}</p>
                      <p className="font-display text-lg tabular">{t.count}</p>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Avg salary by designation */}
            <ChartCard title="Average gross by designation" caption="1.5 × basic">
              {avgSalaryByDesignation.length ? (
                <div className="space-y-3">
                  {avgSalaryByDesignation.map((d) => (
                    <div key={d.name} className="flex items-center justify-between gap-3 border-b border-dashed pb-2.5 last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{d.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {d.count} employee{d.count > 1 ? "s" : ""}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular">{fullMoney(d.avgGross)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel title="No salary data" hint="Employees ki basic salary set hone par averages yahan aayenge." />
              )}
            </ChartCard>

            {/* Attrition risk — bonus feature, transparent scoring */}
            <ChartCard
              title="Attrition risk"
              caption={`${attritionRisk?.highCount ?? 0} high · ${attritionRisk?.mediumCount ?? 0} medium · score 0–100`}
            >
              {attritionRisk?.top?.some((r) => r.level !== "low") ? (
                <div className="space-y-3">
                  {attritionRisk.top
                    .filter((r) => r.level !== "low")
                    .slice(0, 6)
                    .map((r) => (
                      <div key={r.id} className="border-b border-dashed pb-2.5 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-medium">{r.name}</p>
                          <Badge
                            className={`shrink-0 border-transparent text-[10px] capitalize ${
                              r.level === "high"
                                ? "bg-destructive/12 text-destructive hover:bg-destructive/12"
                                : "bg-warning/15 text-warning hover:bg-warning/15"
                            }`}
                          >
                            {r.level} · {r.score}
                          </Badge>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {r.dept} · {r.reasons.slice(0, 2).join(" · ")}
                        </p>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center">
                  <TrendingUp className="size-4 text-success" />
                  <p className="text-xs text-muted-foreground">
                    No elevated risk — team stable hai (score under 30).
                  </p>
                </div>
              )}
            </ChartCard>

            {/* Audit feed — brief admin dashboard element */}
            <ChartCard title="Audit feed" caption="Latest actions">
              {auditFeed.length ? (
                <div className="space-y-3">
                  {auditFeed.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-3 border-b border-dashed pb-2.5 last:border-0 last:pb-0">
                      <span className="font-display text-sm italic text-primary tabular">
                        {String(auditFeed.length - i).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{humanAction(a.action)}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {a.entity.replaceAll("hcm_", "").replaceAll("_", " ")} · {timeLabel(a.createdAt)}
                        </p>
                      </div>
                      {a.actorRole ? (
                        <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                          {a.actorRole}
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center">
                  <ScrollText className="size-4 text-muted-foreground/60" />
                  <p className="text-xs text-muted-foreground">No audited actions yet.</p>
                </div>
              )}
            </ChartCard>
          </div>
        </>
      )}

      <SectionLabel className="pt-2">Insights live updates</SectionLabel>
      <p className="text-xs text-muted-foreground">
        Ye dashboard har query par server se dobara compute hota hai — check-ins, approvals aur payroll
        finalize ke foran baad numbers badal jate hain. AI summary inhi numbers par bullets deti hai.
      </p>
    </div>
  );
}
