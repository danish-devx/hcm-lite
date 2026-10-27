"use client";

import * as React from "react";
import { CalendarCheck2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { ApplyLeaveDialog } from "@/components/modules/leave/apply-dialog";
import { LeaveStatusBadge, rangeLabel, stampLabel } from "@/components/modules/leave/leave-bits";
import { ConfirmDialog } from "@/components/modules/org/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getApiError } from "@/lib/api-error";
import { useCancelLeaveMutation } from "@/store/api/leaveApi";

/**
 * My leave card (M5 employee self-service) — balance cards (per type),
 * apply button + dialog, meri requests list (pending par cancel).
 */

export function MyLeaveCard({ me, title = "My leave", showApply = true }) {
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [cancelTarget, setCancelTarget] = React.useState(null);
  const [cancelLeave, { isLoading: cancelling }] = useCancelLeaveMutation();

  const balances = me?.balances ?? [];
  const requests = me?.myRequests ?? [];
  const tz = me?.timezone ?? "Asia/Karachi";
  const linked = me?.linked;

  async function confirmCancel() {
    if (!cancelTarget) return;
    try {
      await cancelLeave(cancelTarget.id).unwrap();
      toast.success("Leave request cancelled.");
      setCancelTarget(null);
    } catch (err) {
      toast.error(getApiError(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck2 className="size-4 text-primary" /> {title}
            </CardTitle>
            <CardDescription>
              {linked
                ? "Balance, requests aur approvals — sab kuch yahan."
                : "Ye login kisi employee record se linked nahi."}
            </CardDescription>
          </div>
          {linked && showApply ? (
            <Button onClick={() => setApplyOpen(true)} size="sm" className="rounded-full">
              <Plus className="size-4" /> Apply for leave
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {linked ? (
          <>
            {/* Balance cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {balances.map((b) => (
                <div key={b.typeId} className="rounded-xl border p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium leading-tight">{b.name}</p>
                    <span className="micro-label shrink-0 text-[9px]">
                      {b.paid ? "Paid" : "Unpaid"}
                    </span>
                  </div>
                  <BalanceBarCompact balance={b} />
                </div>
              ))}
            </div>

            {/* My requests */}
            <div>
              <p className="micro-label mb-1">My requests</p>
              {requests.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
                  <CalendarCheck2 className="size-6 text-muted-foreground/60" />
                  <p className="max-w-56 text-xs text-muted-foreground">
                    Abhi koi leave request nahi — &ldquo;Apply for leave&rdquo; se shuru karein.
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {requests.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                      <div className="min-w-40">
                        <p className="font-medium tabular">{rangeLabel(r.start_date, r.end_date)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {stampLabel(r.created_at, tz)} ko apply kiya · {Number(r.days)} day
                          {Number(r.days) === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="min-w-32 flex-1">
                        <p className="text-xs text-muted-foreground">“{r.reason}”</p>
                        {r.decision_comment ? (
                          <p className="mt-0.5 line-clamp-1 text-[11px] italic text-muted-foreground">
                            Reviewer: “{r.decision_comment}”
                          </p>
                        ) : null}
                      </div>
                      {r.status === "pending" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-full text-muted-foreground hover:text-destructive"
                          onClick={() => setCancelTarget(r)}
                        >
                          <X className="size-3.5" /> Cancel
                        </Button>
                      ) : null}
                      <LeaveStatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Leave apply karne ke liye employee record link zaroori hai — HR se apna record link karwayein.
          </div>
        )}
      </CardContent>

      <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} me={me} />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Cancel this leave request?"
        description={
          cancelTarget
            ? `${rangeLabel(cancelTarget.start_date, cancelTarget.end_date)} wali pending request cancel ho jayegi.`
            : ""
        }
        confirmLabel="Yes, cancel it"
        loading={cancelling}
        onConfirm={confirmCancel}
      />
    </Card>
  );
}

function BalanceBarCompact({ balance }) {
  const { quota, approved, pending, remaining } = balance;
  if (quota == null) {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-medium tabular">∞</p>
          <p className="text-[11px] text-muted-foreground">{approved > 0 ? `${approved} used` : "No limit"}</p>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted" />
      </div>
    );
  }
  const usedPct = quota > 0 ? Math.min(100, Math.round(((approved + pending) / quota) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-2xl font-medium tabular">
          {remaining}
          <span className="ml-1 text-sm text-muted-foreground">/ {quota}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {approved} used{pending > 0 ? ` · ${pending} pending` : ""}
        </p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${usedPct}%` }} />
      </div>
    </div>
  );
}
