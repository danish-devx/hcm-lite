"use client";

import * as React from "react";
import { FileClock, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { getApiError } from "@/lib/api-error";
import { CorrectionStatusBadge, shortDate, timeInTz } from "./attendance-bits";
import { useRequestCorrectionMutation } from "@/store/api/attendanceApi";

/**
 * Corrections card — employee side (M4): apni recent requests + naya request
 * (date, corrected in/out, wajah). Server future-date/60-day/duplicate rules
 * enforce karta hai; client bas UX smooth rakhta hai.
 */

const EMPTY = { date: "", checkIn: "", checkOut: "", reason: "" };

export function CorrectionsCard({ me, role }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY);
  const [error, setError] = React.useState(null);
  const [requestCorrection, { isLoading }] = useRequestCorrectionMutation();

  const items = me?.corrections ?? [];
  const tz = me?.timezone ?? "Asia/Karachi";
  const today = me?.today ?? "";
  const minDate = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 60);
    return d.toISOString().slice(0, 10);
  })();

  const openDialog = () => {
    setForm({ ...EMPTY, date: today });
    setError(null);
    setOpen(true);
  };

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!form.checkIn && !form.checkOut) {
      setError("Provide the correct check-in, check-out, or both.");
      return;
    }
    try {
      await requestCorrection({
        date: form.date,
        requestedCheckIn: form.checkIn || undefined,
        requestedCheckOut: form.checkOut || undefined,
        reason: form.reason.trim(),
      }).unwrap();
      toast.success("Correction request sent — HR will review it.");
      setOpen(false);
    } catch (err) {
      const { message } = getApiError(err);
      setError(message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <FileClock className="size-4 text-primary" /> Corrections
            </CardTitle>
            <CardDescription>
              Wrong or missing punch? Request a fix — HR review ke baad record update hota hai.
            </CardDescription>
          </div>
          <Button onClick={openDialog} size="sm" className="rounded-full">
            <Plus className="size-4" /> Request correction
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
            <FileClock className="size-6 text-muted-foreground/60" />
            <p className="max-w-56 text-xs text-muted-foreground">
              No correction requests yet — agar kisi din check-in/out ghalat lage to yahan se request karein.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                <div className="min-w-28">
                  <p className="font-medium">{shortDate(c.date)}</p>
                  <p className="text-[11px] text-muted-foreground">{shortDate(c.created_at?.slice(0, 10))} ko request</p>
                </div>
                <div className="min-w-48 flex-1">
                  <p className="text-xs text-muted-foreground">
                    Requested:{" "}
                    <span className="font-medium text-foreground tabular">
                      {timeInTz(c.requested_check_in, tz)} – {timeInTz(c.requested_check_out, tz)}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">“{c.reason}”</p>
                  {c.decision_comment ? (
                    <p className="mt-0.5 line-clamp-1 text-[11px] italic text-muted-foreground">
                      Reviewer: “{c.decision_comment}”
                    </p>
                  ) : null}
                </div>
                <CorrectionStatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
        {role === "employee" ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Last 60 days ki dates ke liye request kar sakte hain — ek date par ek pending request.
          </p>
        ) : null}
      </CardContent>

      {/* Request dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request attendance correction</DialogTitle>
            <DialogDescription>
              Server-reviewed fix — HR approve karega to us din ka record update ho jayega.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="corr-date">Date</Label>
              <Input
                id="corr-date"
                type="date"
                required
                min={minDate}
                max={today}
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="corr-in">Correct check-in</Label>
                <Input
                  id="corr-in"
                  type="time"
                  value={form.checkIn}
                  onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="corr-out">Correct check-out</Label>
                <Input
                  id="corr-out"
                  type="time"
                  value={form.checkOut}
                  onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="corr-reason">Reason *</Label>
              <Textarea
                id="corr-reason"
                required
                rows={3}
                placeholder="e.g. Reached office 9:05 but forgot to punch in"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
    </Card>
  );
}
