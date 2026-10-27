"use client";

import * as React from "react";
import { Banknote, CalendarPlus, Eye, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { getApiError } from "@/lib/api-error";
import { ConfirmDialog } from "@/components/modules/org/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreatePayrollRunMutation,
  useDeletePayrollRunMutation,
} from "@/store/api/payrollApi";
import { money, monthTitle, PayrollStatusBadge } from "./payroll-bits";

/**
 * Payroll runs list (staff) — month, status, totals + new-run dialog.
 * Row click → run detail (parent se onOpen callback).
 */
export function RunsList({ runs, isLoading, onOpen, currentMonth }) {
  const [newOpen, setNewOpen] = React.useState(false);
  const [month, setMonth] = React.useState(currentMonth);
  const [createRun, { isLoading: creating }] = useCreatePayrollRunMutation();
  const [deleteRun, { isLoading: deleting }] = useDeletePayrollRunMutation();
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  async function handleCreate() {
    try {
      const res = await createRun({ month }).unwrap();
      toast.success(`Draft created — ${monthTitle(month)}`);
      setNewOpen(false);
      onOpen(res.data.run.id);
    } catch (err) {
      toast.error(getApiError(err));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteRun(deleteTarget.id).unwrap();
      toast.success(`${monthTitle(deleteTarget.month)} draft deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getApiError(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="micro-label">Payroll runs</p>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <CalendarPlus className="size-4" /> New payroll run
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-14 text-center">
          <Banknote className="size-8 text-muted-foreground/50" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No payroll runs yet</p>
            <p className="mx-auto max-w-sm text-xs text-muted-foreground">
              Create the first monthly run — items compute from salary structure, attendance and
              approved leave. Admin finalizes when the draft looks right.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
            <CalendarPlus className="size-4" /> New payroll run
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Month</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Employees</th>
                <th className="px-4 py-2.5 text-right font-medium">Gross</th>
                <th className="px-4 py-2.5 text-right font-medium">Net total</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="w-10 px-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer transition-colors hover:bg-accent/40"
                  onClick={() => onOpen(r.id)}
                >
                  <td className="px-4 py-3 font-medium">{monthTitle(r.month)}</td>
                  <td className="px-4 py-3">
                    <PayrollStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular">{r.totals?.employees ?? 0}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground tabular">
                    {money(r.totals?.gross)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular">
                    {money(r.totals?.net)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.createdByName ?? "—"}
                  </td>
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpen(r.id)}>
                          <Eye className="size-4" /> View run
                        </DropdownMenuItem>
                        {r.status === "draft" ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="size-4" /> Delete draft
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New run dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New payroll run</DialogTitle>
            <DialogDescription>
              Month choose karein — items salary (gross = 1.5 × basic), attendance aur approved
              leave se compute honge. Draft rehta hai; sirf Admin finalize kar sakta hai.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="run-month">
              Payroll month
            </label>
            <Input
              id="run-month"
              type="month"
              value={month}
              max={currentMonth}
              onChange={(e) => setMonth(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Future months blocked — current month me sirf guzre din absences count hote hain.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !month}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : null}
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget ? monthTitle(deleteTarget.month) : ""} draft?`}
        description="Draft run aur uske items delete ho jayenge. Finalized runs locked hote hain — delete nahi hote."
        confirmLabel="Delete draft"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
