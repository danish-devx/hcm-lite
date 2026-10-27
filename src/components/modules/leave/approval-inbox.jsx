"use client";

import * as React from "react";
import { Check, Inbox, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  LeaveStatusBadge,
  rangeLabel,
  stampLabel,
} from "@/components/modules/leave/leave-bits";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiError } from "@/lib/api-error";
import {
  useCancelLeaveMutation,
  useDecideLeaveMutation,
} from "@/store/api/leaveApi";

/**
 * Approval inbox (M5 staff) — pending leave queue with approve/reject +
 * comment dialog. Decided requests yahan se gayab ho jate hain (RTK refetch).
 */

export function ApprovalInbox({ rows, isLoading, tz }) {
  const [target, setTarget] = React.useState(null); // { request, action }
  const [comment, setComment] = React.useState("");
  const [error, setError] = React.useState(null);
  const [decideLeave, { isLoading: deciding }] = useDecideLeaveMutation();
  const [cancelLeave, { isLoading: cancelling }] = useCancelLeaveMutation();

  const pending = (rows ?? []).filter((r) => r.status === "pending");

  const openDecision = (request, action) => {
    setTarget({ request, action });
    setComment("");
    setError(null);
  };

  async function confirmDecision() {
    if (!target) return;
    const { request, action } = target;
    try {
      await decideLeave({
        id: request.id,
        action,
        comment: comment.trim() || undefined,
      }).unwrap();
      toast.success(action === "approve" ? "Leave approved." : "Leave rejected.");
      setTarget(null);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  async function quickCancel(request) {
    try {
      await cancelLeave(request.id).unwrap();
      toast.success("Pending request cancelled.");
    } catch (err) {
      toast.error(getApiError(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="size-4 text-primary" /> Approval inbox
        </CardTitle>
        <CardDescription>
          Pending leave requests — comment ke saath approve ya reject karein.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : pending.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
            <Check className="size-6 text-success" />
            <p className="text-sm font-medium">Inbox clear hai</p>
            <p className="max-w-56 text-xs text-muted-foreground">
              Koi pending leave request nahi — naye requests yahan live aayengi.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 text-sm">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {(r.full_name ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-40">
                  <p className="font-medium leading-tight">
                    {r.full_name} <span className="text-[11px] text-muted-foreground tabular">{r.code}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.type_name} · {stampLabel(r.created_at, tz)}
                  </p>
                </div>
                <div className="min-w-36">
                  <p className="font-medium tabular">{rangeLabel(r.start_date, r.end_date)}</p>
                  <p className="text-[11px] text-muted-foreground tabular">
                    {Number(r.days)} working day{Number(r.days) === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="min-w-40 flex-1 truncate text-xs text-muted-foreground">“{r.reason}”</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    className="h-8 rounded-full"
                    onClick={() => openDecision(r, "approve")}
                  >
                    <Check className="size-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-full"
                    onClick={() => openDecision(r, "reject")}
                  >
                    <X className="size-3.5" /> Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Recent decisions strip */}
        {(rows ?? []).some((r) => r.status !== "pending") ? (
          <div className="mt-4 border-t pt-3">
            <p className="micro-label mb-2">Recently decided</p>
            <div className="flex flex-wrap gap-1.5">
              {(rows ?? [])
                .filter((r) => r.status !== "pending")
                .slice(0, 8)
                .map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-[11px]"
                  >
                    <span className="font-medium">{(r.full_name ?? "?").split(" ")[0]}</span>
                    <span className="text-muted-foreground tabular">{r.type_code}</span>
                    <LeaveStatusBadge status={r.status} className="h-4 px-1.5 text-[9px]" />
                  </span>
                ))}
            </div>
          </div>
        ) : null}
      </CardContent>

      {/* Decide dialog */}
      <Dialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {target?.action === "approve" ? "Approve leave request" : "Reject leave request"}
            </DialogTitle>
            <DialogDescription>
              {target?.request
                ? `${target.request.full_name} · ${target.request.type_name} · ${rangeLabel(
                    target.request.start_date,
                    target.request.end_date
                  )} (${Number(target.request.days)} day(s))`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="lv-comment">Comment {target?.action === "reject" ? "(recommended)" : "(optional)"}</Label>
              <Textarea
                id="lv-comment"
                rows={3}
                placeholder={
                  target?.action === "approve"
                    ? "e.g. Approved — team cover arranged"
                    : "e.g. Month-end crunch week — please re-apply next week"
                }
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              {target?.request ? (
                <p className="text-[11px] text-muted-foreground">Reason: “{target.request.reason}”</p>
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setTarget(null)}>
                Cancel
              </Button>
              <Button
                onClick={confirmDecision}
                disabled={deciding}
                variant={target?.action === "approve" ? "default" : "destructive"}
              >
                {deciding ? <Loader2 className="size-4 animate-spin" /> : null}
                {target?.action === "approve" ? "Approve leave" : "Reject leave"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
