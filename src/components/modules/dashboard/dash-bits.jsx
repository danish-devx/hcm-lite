import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dashboard shared bits (Phase 7 — M7) — editorial stat card, section label,
 * empty/loading states, money compaction. Ivory Bloom tokens only.
 */

/** PKR compact — "PKR 1.24M" / "PKR 940k" (axis + KPI cards). */
export function compactMoney(n) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1_000_000) return `PKR ${(v / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (Math.abs(v) >= 1_000) return `PKR ${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `PKR ${Math.round(v).toLocaleString("en-US")}`;
}

/** Minutes → "38h 30m" (client mirror of dashboard.service fmtHours). */
export function fmtHoursLabel(minutes) {
  const m = Math.max(0, Math.round(Number(minutes ?? 0)));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h ? `${h}h ${rem ? `${rem}m` : ""}`.trim() : `${rem}m`;
}

/** Full money for tooltips/subtitles. */
export function fullMoney(n) {
  return `PKR ${Math.round(Number(n ?? 0)).toLocaleString("en-US")}`;
}

export function SectionLabel({ children, className = "" }) {
  return <p className={`micro-label ${className}`}>{children}</p>;
}

/**
 * KPI stat card — editorial: micro-label, display-serif tabular value, sub note.
 * foot: optional node (progress bar, delta pill) rendered under the sub.
 */
export function StatCard({ label, value, sub, icon: Icon, foot, loading = false }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="micro-label">{label}</p>
        {Icon ? (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-24" />
      ) : (
        <p className="mt-2 font-display text-3xl font-medium tracking-tight tabular">{value}</p>
      )}
      {sub && !loading ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      {foot}
    </div>
  );
}

/** Slim progress bar (hours vs target, utilization). */
export function MiniBar({ pct, className = "" }) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(pct ?? 0))));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-muted ${className}`}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** Friendly empty panel — fresh installs par judges ko clear guidance milti hai. */
export function EmptyPanel({ title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <p className="font-display text-lg">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Chart card shell — consistent padding + micro-label + caption. */
export function ChartCard({ title, caption, children, className = "" }) {
  return (
    <div className={`min-w-0 rounded-xl border bg-card p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex flex-col items-start gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <p className="micro-label min-w-0 max-w-full">{title}</p>
        {caption ? <p className="max-w-full text-left text-[11px] text-muted-foreground sm:text-right">{caption}</p> : null}
      </div>
      {children}
    </div>
  );
}
