"use client";

import * as React from "react";
import {
  ArrowLeft,
  Download,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { getApiError } from "@/lib/api-error";
import { ConfirmDialog } from "@/components/modules/org/confirm-dialog";
import { initialsFor } from "@/components/modules/employees/employee-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useFinalizePayrollRunMutation,
  useGetPayrollRunQuery,
  useRecalculatePayrollRunMutation,
} from "@/store/api/payrollApi";
import { DeductionChips, money, monthTitle, num, PayrollStatusBadge } from "./payroll-bits";

/**
 * Run detail (staff) — totals strip, items table w/ per-row payslip PDF,
 * draft actions (recalc) + admin finalize. Finalized = locked banner.
 */
export function RunDetail({ runId, onBack, role }) {
  const { data, isLoading, error } = useGetPayrollRunQuery(runId);
  const [finalizeRun, { isLoading: finalizing }] = useFinalizePayrollRunMutation();
  const [recalcRun, { isLoading: recalcing }] = useRecalculatePayrollRunMutation();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const isAdmin = role === "admin";

  async function handleFinalize() {
    try {
      await finalizeRun(runId).unwrap();
      toast.success(`${monthTitle(data?.run?.month)} finalized — run is now locked.`);
      setConfirmOpen(false);
    } catch (err) {
      toast.error(getApiError(err));
    }
  }

  async function handleRecalc() {
    try {
      const res = await recalcRun(runId).unwrap();
      toast.success(`Recalculated — ${res.data.items} item(s) refreshed.`);
    } catch (err) {
      toast.error(getApiError(err));
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40 rounded-full" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> All runs
        </Button>
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Run load nahi hua — shayad delete ho gaya.
        </p>
      </div>
    );
  }

  const { run, items, totals } = data;
  const isDraft = run.status === "draft";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="size-4" /> All runs
        </Button>
      </div>

      {/* Run header */}
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <h3 className="font-display text-2xl font-medium tracking-tight">
                {monthTitle(run.month)}
              </h3>
              <PayrollStatusBadge status={run.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              Created by {run.createdByName ?? "—"}
              {run.finalized_at
                ? ` · Finalized by ${run.finalizedByName ?? "—"} · ${String(run.finalized_at).slice(0, 10)}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isDraft ? (
              <>
                <Button variant="outline" size="sm" onClick={handleRecalc} disabled={recalcing}>
                  {recalcing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Recalculate
                </Button>
                {isAdmin ? (
                  <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={finalizing}>
                    <ShieldCheck className="size-4" /> Finalize
                  </Button>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Admin finalize karega
                  </Badge>
                )}
              </>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
                <Lock className="size-3.5" /> Locked — items immutable
              </span>
            )}
          </div>
        </div>

        {/* Totals strip */}
        <div className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-4">
          {[
            ["Employees", String(totals.employees)],
            ["Gross total", money(totals.gross)],
            ["Deductions + tax", money(Number(totals.deductions) + Number(totals.tax))],
            ["Net payout", money(totals.net)],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-5 py-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-medium tabular">{value}</p>
            </div>
          ))}
        </div>

        {isDraft ? (
          <p className="border-t bg-warning/5 px-5 py-3 text-xs text-warning">
            Draft — numbers attendance aur approved leave se compute hote hain. Finalize se run
            lock ho jata hai aur phir edit/delete nahi hota.
          </p>
        ) : null}
      </div>

      {/* Items table */}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Is run me koi item nahi — Recalculate try karein.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Employee</th>
                <th className="px-4 py-2.5 font-medium">Department</th>
                <th className="px-4 py-2.5 text-right font-medium">Basic</th>
                <th className="px-4 py-2.5 text-right font-medium">Gross</th>
                <th className="px-4 py-2.5 text-center font-medium">Days (work / pay)</th>
                <th className="px-4 py-2.5 font-medium">Deductions</th>
                <th className="px-4 py-2.5 text-right font-medium">Tax</th>
                <th className="px-4 py-2.5 text-right font-medium">Net</th>
                <th className="w-12 px-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((it) => (
                <tr key={it.id} className="transition-colors hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary">
                        {initialsFor(it.employee?.fullName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium leading-tight">
                          {it.employee?.fullName ?? "—"}
                          {it.employee?.status !== "active" ? (
                            <span className="ml-1.5 text-[10px] text-warning">(inactive)</span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular">
                          {it.employee?.code ?? "—"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {it.employee?.department ?? "—"}
                    {it.employee?.designation ? (
                      <span className="block text-[11px]">{it.employee.designation}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular">{num(it.basic)}</td>
                  <td className="px-4 py-3 text-right tabular text-muted-foreground">
                    {num(it.gross)}
                  </td>
                  <td className="px-4 py-3 text-center text-xs tabular">
                    {it.working_days} / <span className="font-medium">{num(it.payable_days)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <DeductionChips item={it} />
                  </td>
                  <td className="px-4 py-3 text-right tabular">{num(it.tax)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular">{num(it.net)}</td>
                  <td className="px-2 py-3">
                    <a
                      href={`/api/payroll/payslips/${it.id}/pdf`}
                      title="Download payslip PDF"
                      className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Download className="size-4" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40 text-sm font-medium">
                <td className="px-4 py-2.5" colSpan={2}>
                  Total ({totals.employees} employees)
                </td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right tabular">{num(totals.gross)}</td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right tabular">{num(totals.tax)}</td>
                <td className="px-4 py-2.5 text-right tabular">{num(totals.net)}</td>
                <td className="px-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Deduction rules: absent + unpaid full day · half day 0.5 · late penalty every 3 lates = 0.5
        day. Payslips download per-row PDF icon se.
      </p>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Finalize ${monthTitle(run.month)} payroll?`}
        description="Finalize ke baad run LOCK ho jata hai — koi edit, recalculate ya delete nahi hoga. Ye action audit log me record hota hai."
        confirmLabel="Finalize & lock"
        loading={finalizing}
        onConfirm={handleFinalize}
      />
    </div>
  );
}
