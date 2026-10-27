import { Badge } from "@/components/ui/badge";

/**
 * Attendance client bits (Phase 4) — status badges, company-tz time helpers,
 * live elapsed timer math. Server status names (snake_case) ko UI labels se
 * jodta hai.
 */

export const STATUS_STYLES = {
  present: "border-transparent bg-success/15 text-success hover:bg-success/15",
  late: "border-transparent bg-warning/15 text-warning hover:bg-warning/15",
  half_day: "border-transparent bg-info/15 text-info hover:bg-info/15",
  missing_checkout: "border-transparent bg-warning/15 text-warning hover:bg-warning/15",
  absent: "border-transparent bg-destructive/12 text-destructive hover:bg-destructive/12",
  on_leave: "border-transparent bg-info/15 text-info hover:bg-info/15",
  weekend: "border-transparent bg-muted text-muted-foreground hover:bg-muted",
  holiday: "border-transparent bg-muted text-muted-foreground hover:bg-muted",
  not_checked_in: "border-transparent bg-muted text-muted-foreground hover:bg-muted",
  upcoming: "border-transparent bg-muted text-muted-foreground/60 hover:bg-muted",
};

export const STATUS_LABELS = {
  present: "On time",
  late: "Late",
  half_day: "Half day",
  missing_checkout: "Missing checkout",
  absent: "Absent",
  on_leave: "On leave",
  weekend: "Weekend",
  holiday: "Holiday",
  not_checked_in: "Not checked in",
  upcoming: "—",
};

export function AttendanceStatusBadge({ status, label, className = "" }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.upcoming;
  return (
    <Badge className={`${style} ${className}`}>{label ?? STATUS_LABELS[status] ?? status}</Badge>
  );
}

/** ISO timestamp → "09:04 AM" in company tz. */
export function timeInTz(iso, tz) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

/** "2026-10-27" → "27 Oct" */
export function shortDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${dateStr}T00:00:00Z`));
  } catch {
    return dateStr;
  }
}

/** ISO → "27 Oct 2026, 09:04 AM" in company tz. */
export function fullStamp(iso, tz) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Elapsed ms → "3h 42m" (display ke liye). */
export function elapsedLabel(ms) {
  if (!ms || ms < 0) return "0m";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Corrections status badge. */
export function CorrectionStatusBadge({ status }) {
  if (status === "pending") {
    return <Badge className="border-transparent bg-warning/15 text-warning hover:bg-warning/15">Pending</Badge>;
  }
  if (status === "approved") {
    return <Badge className="border-transparent bg-success/15 text-success hover:bg-success/15">Approved</Badge>;
  }
  return <Badge variant="outline" className="text-destructive border-destructive/30">Rejected</Badge>;
}
