"use client";

import * as React from "react";
import { Banknote, Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetMyPayslipsQuery } from "@/store/api/payrollApi";
import { money, monthTitle, num } from "./payroll-bits";

/**
 * My Payslips (employee self-service) — finalized-run payslips only.
 * Draft runs yahan kabhi nahi dikhte (brief: employee cannot see draft).
 */
export function MyPayslips() {
  const { data, isLoading } = useGetMyPayslipsQuery();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      {data?.summary ? (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
          {[
            ["Payslips", String(data.summary.payslips)],
            ["Last payout", `${money(data.summary.lastNet)} · ${monthTitle(data.summary.lastMonth)}`],
            ["Total net (history)", money(data.summary.ytdNet)],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-5 py-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-base font-medium tabular">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-14 text-center">
          <Banknote className="size-8 text-muted-foreground/50" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No payslips yet</p>
            <p className="mx-auto max-w-sm text-xs text-muted-foreground">
              {data?.linked === false
                ? "Aap ka login kisi employee record se linked nahi — HR se rabta karein."
                : "Payslips yahan show honge jab company aap ki payroll finalize karegi."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-display text-lg font-medium tracking-tight">
                    {monthTitle(p.run?.month)}
                  </h4>
                  <Badge variant="outline" className="text-[10px]">
                    Finalized
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground tabular">
                  Gross {num(p.gross)} · Deductions {num(p.deductions)} · Tax {num(p.tax)} ·{" "}
                  {num(p.payable_days)} payable days
                </p>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-xl font-semibold tabular">{money(p.net)}</p>
                <a
                  href={`/api/payroll/payslips/${p.id}/pdf`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Download className="size-4" /> PDF
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
