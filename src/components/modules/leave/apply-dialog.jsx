"use client";

import * as React from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiError } from "@/lib/api-error";
import { useApplyLeaveMutation } from "@/store/api/leaveApi";

/**
 * Apply leave dialog (M5) — live working-days counter (weekend/holiday
 * exclude), type balance hint, server rules (balance/overlap/past) se
 * clean error messages. `initial` — AI smart-leave prefill (Phase 8).
 */

const EMPTY = { leaveTypeId: "", startDate: "", endDate: "", reason: "" };

export function ApplyLeaveDialog({ open, onOpenChange, me, employee = null, onApplied, initial = null }) {
  const [form, setForm] = React.useState(EMPTY);
  const [error, setError] = React.useState(null);
  const [applyLeave, { isLoading }] = useApplyLeaveMutation();

  const weekendDays = me?.weekendDays ?? [0, 6];
  const holidaySet = new Set(me?.holidays ?? []);
  const today = me?.today ?? "";
  const balances = me?.balances ?? [];
  const leaveTypes = me?.leaveTypes ?? [];

  const selectedType = leaveTypes.find((t) => t.id === form.leaveTypeId) ?? null;
  const selectedBalance = balances.find((b) => b.typeId === form.leaveTypeId) ?? null;

  // Live working-days count + calendar-day total (weekend/holiday aware)
  const preview = React.useMemo(() => {
    if (!form.startDate || !form.endDate || form.endDate < form.startDate) return null;
    const working = [];
    const weekends = new Set(weekendDays.map(Number));
    let cursor = form.startDate;
    let total = 0;
    for (let i = 0; i < 62 && cursor <= form.endDate; i += 1) {
      total += 1;
      const dow = new Date(`${cursor}T00:00:00Z`).getUTCDay();
      const isWeekend = weekends.has(dow);
      const isHoliday = holidaySet.has(cursor);
      if (!isWeekend && !isHoliday) working.push(cursor);
      const d = new Date(`${cursor}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      cursor = d.toISOString().slice(0, 10);
    }
    return { working: working.length, total };
  }, [form.startDate, form.endDate, weekendDays, holidaySet]);

  const balanceHint = React.useMemo(() => {
    if (!selectedBalance || selectedBalance.quota == null || !preview) return null;
    if (preview.working > selectedBalance.remaining) {
      return `Only ${selectedBalance.remaining} day(s) of ${selectedType?.name} left — server will reject this.`;
    }
    return `${selectedBalance.remaining} day(s) remaining of ${selectedBalance.quota}.`;
  }, [selectedBalance, selectedType, preview]);

  React.useEffect(() => {
    if (!open) return undefined;
    const t = window.setTimeout(() => {
      setForm(
        initial
          ? {
              leaveTypeId: initial.leaveTypeId || "",
              startDate: initial.startDate || today,
              endDate: initial.endDate || initial.startDate || today,
              reason: initial.reason || "",
            }
          : { ...EMPTY, startDate: today, endDate: today }
      );
      setError(null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, today, initial]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!form.leaveTypeId) {
      setError("Please select a leave type.");
      return;
    }
    if (!form.startDate || !form.endDate) {
      setError("Select start and end dates.");
      return;
    }
    if (form.endDate < form.startDate) {
      setError("End date cannot be before the start date.");
      return;
    }
    try {
      const res = await applyLeave({
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim(),
        ...(employee ? { employeeId: employee.id } : {}),
      }).unwrap();
      toast.success(
        employee
          ? `Leave filed for ${employee.full_name} — pending approval.`
          : "Leave request sent — HR will review it."
      );
      onOpenChange(false);
      onApplied?.(res?.data);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="size-4 text-primary" />
            {employee ? `Apply for ${employee.full_name}` : "Apply for leave"}
          </DialogTitle>
          <DialogDescription>
            Working days automatically count hote hain — weekends aur holidays range me nahi gintay.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2">
            <Label>Leave type</Label>
            <Select value={form.leaveTypeId} onValueChange={(v) => setForm((f) => ({ ...f, leaveTypeId: v }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t) => {
                  const bal = balances.find((b) => b.typeId === t.id);
                  const suffix = bal?.quota != null ? ` · ${bal.remaining}/${bal.quota} left` : bal ? " · unlimited" : "";
                  return (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {suffix}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {balanceHint ? (
              <p className={`text-xs ${balanceHint.includes("reject") ? "text-destructive" : "text-muted-foreground"}`}>
                {balanceHint}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="lv-start">From</Label>
              <Input
                id="lv-start"
                type="date"
                required
                min={today}
                value={form.startDate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    startDate: e.target.value,
                    endDate: f.endDate && f.endDate < e.target.value ? e.target.value : f.endDate,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lv-end">To</Label>
              <Input
                id="lv-end"
                type="date"
                required
                min={form.startDate || today}
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>

          {preview ? (
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              <span className="font-medium tabular">{preview.working}</span>{" "}
              working day{preview.working === 1 ? "" : "s"} ({preview.total} calendar day
              {preview.total === 1 ? "" : "s"} — weekend/holiday minus)
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="lv-reason">Reason *</Label>
            <Textarea
              id="lv-reason"
              required
              rows={3}
              placeholder="e.g. Family wedding out of city"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
              Send request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
