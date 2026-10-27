"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  Camera,
  Clock3,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  MapPinOff,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getApiError } from "@/lib/api-error";
import { AttendanceStatusBadge, STATUS_LABELS, elapsedLabel, timeInTz } from "./attendance-bits";
import { CameraCheckInDialog, getPosition } from "./camera-checkin-dialog";
import { useCheckInMutation, useCheckOutMutation } from "@/store/api/attendanceApi";

/**
 * Check-in hero (M4) — live company clock, GPS capture (optional, server
 * geofence enforce karta hai jab coords milte hain), live elapsed timer.
 * Time stamping SERVER ka kaam hai — client sirf display + coords bhejta hai.
 */

function useTicker(intervalMs = 1000) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
}

function useCompanyClock(tz) {
  useTicker(1000);
  const now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  return { time, date };
}

export function CheckInCard({ me }) {
  const [checkIn, { isLoading: checkingIn }] = useCheckInMutation();
  const [checkOut, { isLoading: checkingOut }] = useCheckOutMutation();
  const [cameraOpen, setCameraOpen] = React.useState(false);

  const tz = me?.timezone ?? "Asia/Karachi";
  const clock = useCompanyClock(tz);
  const [busy, setBusy] = React.useState(false);
  const [inlineError, setInlineError] = React.useState(null);
  const [locState, setLocState] = React.useState("idle"); // idle|asking|ready|denied|off
  const [lastDistance, setLastDistance] = React.useState(null);

  const record = me?.todayRecord ?? null;
  const checkedIn = Boolean(record?.check_in);
  const checkedOut = Boolean(record?.check_out);
  const office = me?.office ?? {};
  const radius = office.radius_m;

  // Live elapsed while working
  useTicker(30000);
  const elapsed = checkedIn && !checkedOut ? Date.now() - new Date(record.check_in).getTime() : 0;

  // Weekend / holiday notice
  const todayWeekend = (() => {
    if (!me?.today || !office.weekend_days) return false;
    const d = new Date(`${me.today}T00:00:00Z`).getUTCDay();
    return office.weekend_days.includes(d);
  })();

  async function handleCheckIn() {
    setInlineError(null);
    setBusy(true);
    setLocState("asking");
    const pos = await getPosition();
    setLocState(pos.ok ? "ready" : pos.reason === "denied" ? "denied" : "off");
    try {
      const payload = pos.ok ? { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, source: "web" } : { source: "web" };
      const res = await checkIn(payload).unwrap();
      setLastDistance(res?.data?.distanceM ?? null);
      const status = res?.data?.attendance?.status;
      toast.success(
        status === "late"
          ? `Checked in — marked Late (after ${office.office_start} + ${office.grace_minutes}m grace).`
          : "Checked in — have a great day!",
        pos.ok && res?.data?.distanceM != null
          ? { description: `Recorded from ${res.data.distanceM} m away.` }
          : undefined
      );
    } catch (err) {
      const { message } = getApiError(err);
      setInlineError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCameraDone(res) {
    setCameraOpen(false);
    setInlineError(null);
    const status = res?.attendance?.status;
    toast.success(
      status === "late"
        ? `Checked in via camera — marked Late (after ${office.office_start} + ${office.grace_minutes}m grace).`
        : "Checked in via camera — face verified!",
      res?.distanceM != null ? { description: `Recorded from ${res.distanceM} m away.` } : undefined
    );
  }

  async function handleCheckOut() {
    setInlineError(null);
    setBusy(true);
    try {
      await checkOut().unwrap();
      toast.success("Checked out — see you tomorrow!");
    } catch (err) {
      const { message } = getApiError(err);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const working = checkedIn && !checkedOut;

  return (
    <Card className="relative overflow-hidden border-primary/25">
      <div className="pointer-events-none absolute -top-20 -right-16 size-48 rounded-full bg-primary/12 blur-3xl" />
      <CardContent className="relative space-y-5 p-6 sm:p-8">
        {/* Live clock */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="micro-label">Company time · {tz}</p>
            <p className="font-display text-4xl font-medium tabular tracking-tight sm:text-5xl">
              {clock.time}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{clock.date}</p>
          </div>
          {me?.todayStatus ? (
            <div className="flex flex-col items-end gap-1.5">
              <AttendanceStatusBadge status={me.todayStatus} />
              {todayWeekend ? (
                <span className="text-[11px] text-muted-foreground">Weekend — check-in still counted.</span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* State line */}
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          {!checkedIn && (
            <p className="text-muted-foreground">
              Not checked in yet. Office starts{" "}
              <span className="font-medium text-foreground">{office.office_start ?? "09:00"}</span> — grace{" "}
              <span className="font-medium text-foreground">{office.grace_minutes ?? 15} min</span>, after that the
              day is marked <span className="text-warning">Late</span>.
            </p>
          )}
          {working && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-success">●</span>
              <p>
                Checked in at{" "}
                <span className="font-medium tabular">{timeInTz(record.check_in, tz)}</span>
                {" "}· working for{" "}
                <span className="font-semibold tabular text-primary">{elapsedLabel(elapsed)}</span>
                {" "}· checkout after{" "}
                <span className="font-medium">{office.half_day_hours ?? 5}h</span> avoids half-day.
              </p>
            </div>
          )}
          {checkedOut && (
            <p className="text-muted-foreground">
              Day complete — checked in <span className="tabular">{timeInTz(record.check_in, tz)}</span>, out{" "}
              <span className="tabular">{timeInTz(record.check_out, tz)}</span> (
              <span className="font-medium text-foreground">{elapsedLabel((new Date(record.check_out) - new Date(record.check_in)))}</span>
              ). Status: <AttendanceStatusBadge status={record.status} className="mx-1" />
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {!checkedIn ? (
            <>
              <Button onClick={handleCheckIn} disabled={busy || checkingIn} size="lg" className="min-w-44">
                {busy || checkingIn ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                {busy || checkingIn ? (locState === "asking" ? "Getting location…" : "Checking in…") : "Check in"}
              </Button>
              <Button
                onClick={() => setCameraOpen(true)}
                variant="outline"
                size="lg"
                disabled={busy || checkingIn}
              >
                <Camera className="size-4" /> Camera
              </Button>
            </>
          ) : !checkedOut ? (
            <Button onClick={handleCheckOut} disabled={busy || checkingOut} size="lg" variant="outline" className="min-w-44">
              {busy || checkingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              {busy || checkingOut ? "Checking out…" : "Check out"}
            </Button>
          ) : (
            <div className="flex h-11 items-center gap-2 rounded-full border px-5 text-sm text-muted-foreground">
              <Clock3 className="size-4" /> Day closed — see you tomorrow
            </div>
          )}

          {/* Location hint */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {locState === "asking" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Getting GPS…
              </>
            ) : locState === "ready" ? (
              <>
                <MapPin className="size-3.5 text-success" />
                Location attached{lastDistance != null ? ` · ${lastDistance} m from office` : ""}
              </>
            ) : locState === "denied" ? (
              <>
                <MapPinOff className="size-3.5 text-warning" /> Location denied — checked in without geofence
              </>
            ) : locState === "off" ? (
              <>
                <MapPinOff className="size-3.5" /> No GPS — checked in without location
              </>
            ) : (
              <>
                <ShieldCheck className="size-3.5" /> Time is stamped by the server, not your device
              </>
            )}
          </div>
        </div>

        {/* Geofence / server error */}
        {inlineError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
            <p className="font-medium">Check-in blocked</p>
            <p className="mt-0.5 opacity-90">{inlineError}</p>
          </div>
        ) : null}

        {/* Geofence meta */}
        {radius ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ArrowRightLeft className="size-3" />
            Geofence on: check-ins with location must be within {radius} m of the office (server-verified).
          </p>
        ) : null}

        <CameraCheckInDialog
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          onDone={handleCameraDone}
        />
      </CardContent>
    </Card>
  );
}
