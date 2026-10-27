import { Badge } from "@/components/ui/badge";

/**
 * Leave client bits (Phase 5) — status badges, balance bar, date helpers.
 * Ivory Bloom tokens: success/warning/destructive/muted washes.
 */

export const LEAVE_STATUS_STYLES = {
  pending: "border-transparent bg-warning/15 text-warning hover:bg-warning/15",
  approved: "border-transparent bg-success/15 text-success hover:bg-success/15",
  rejected: "border-transparent bg-destructive/12 text-destructive hover:bg-destructive/12",
  cancelled: "border-transparent bg-muted text-muted-foreground hover:bg-muted",
};

export function LeaveStatusBadge({ status, className = "" }) {
  const style = LEAVE_STATUS_STYLES[status] ?? LEAVE_STATUS_STYLES.cancelled;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : "—";
  return <Badge className={`${style} ${className}`}>{label}</Badge>;
}

/**
 * Balance bar — used/total (quota). quota null (unpaid) → unlimited pill.
 */
export function BalanceBar({ balance }) {
  const { quota, approved, pending, remaining } = balance;
  if (quota == null) {
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-medium tabular">∞</p>
          <p className="text-[11px] text-muted-foreground">
            {approved > 0 ? `${approved} used` : "No quota limit"}
          </p>
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
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${usedPct}%` }}
        />
      </div>
    </div>
  );
}

/** "2026-10-27" → "27 Oct 2026" */
export function longDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${dateStr}T00:00:00Z`));
  } catch {
    return dateStr;
  }
}

/** Range → "3 – 5 Nov 2026" (same month) ya "30 Oct – 2 Nov 2026". */
export function rangeLabel(startStr, endStr) {
  if (!startStr) return "—";
  if (!endStr || startStr === endStr) return longDate(startStr);
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  if (sy === ey && sm === em) return `${sd} – ${ed} ${monthName(sm)} ${sy}`;
  if (sy === ey) return `${sd} ${monthName(sm)} – ${ed} ${monthName(em)} ${sy}`;
  return `${longDate(startStr)} – ${longDate(endStr)}`;
}

function monthName(m) {
  return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, m - 1, 1))
  );
}

/** ISO created_at → "27 Oct, 9:04 AM" in company tz. */
export function stampLabel(iso, tz) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** YYYY-MM → "November 2026" */
export function monthTitle(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}
