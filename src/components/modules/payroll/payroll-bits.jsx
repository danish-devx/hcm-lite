import { Badge } from "@/components/ui/badge";

/**
 * Payroll client bits (Phase 6) — status badge, month labels, money helpers.
 */

export const PAYROLL_STATUS_STYLES = {
  draft: "border-transparent bg-warning/15 text-warning hover:bg-warning/15",
  finalized: "border-transparent bg-success/15 text-success hover:bg-success/15",
};

export function PayrollStatusBadge({ status, className = "" }) {
  const style = PAYROLL_STATUS_STYLES[status] ?? PAYROLL_STATUS_STYLES.draft;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : "—";
  return <Badge className={`${style} ${className}`}>{label}</Badge>;
}

/** "2026-10" → "October 2026" (UI + payslip titles ek hi jaisa). */
export function monthTitle(month) {
  if (!month) return "—";
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

/** DB numeric strings → whole-rupee display. */
export function money(n) {
  return `PKR ${Math.round(Number(n ?? 0)).toLocaleString("en-US")}`;
}

/** Compact money for table cells — "150,000". Keeps 0.5 precision for days. */
export function num(n) {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Deduction day-chips — table me compact dikhta hai (late penalty included). */
export function DeductionChips({ item }) {
  const chips = [];
  if (Number(item.absent_days) > 0) chips.push(`${item.absent_days} absent`);
  if (Number(item.unpaid_days) > 0) chips.push(`${item.unpaid_days} unpaid`);
  if (Number(item.half_days) > 0) chips.push(`${item.half_days} half`);
  if (Number(item.lateDays) > 0) {
    chips.push(
      Number(item.latePenaltyDays) > 0
        ? `${item.lateDays} lates · −${item.latePenaltyDays}d`
        : `${item.lateDays} lates`
    );
  }
  if (chips.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c}
          className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive"
        >
          {c}
        </span>
      ))}
    </div>
  );
}
