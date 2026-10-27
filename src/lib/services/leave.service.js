/**
 * Leave service (Phase 5 — M5) — business rules yahan hain, routes thin rehte hain.
 *
 * Brief rules:
 *  - Apply: working-days count (weekend + holidays exclude), balance check
 *    (quota wale types), overlap check (pending/approved request se takrao = 409)
 *  - Balance: yearly_quota − (approved + pending days, us year me) — unpaid
 *    types ka quota null = unlimited, bas track hota hai
 *  - Approve/reject: staff-only + comment; cancel: apna pending (RPC) ya
 *    staff kisi bhi pending ko
 *  - Approved leave attendance me "on_leave" status deta hai (Phase 4 se
 *    effectiveStatus already leave-aware hai)
 */

// ---------------------------------------------------------------------------
// Working days — weekend + holiday aware
// ---------------------------------------------------------------------------

/**
 * [start, end] me se kitne WORKING days hain (company weekend + holidays
 * exclude). Dono inclusive. Pure non-working range → 0 (caller 422 deta hai).
 */
export function countWorkingDays(startStr, endStr, weekendDays, holidaySet) {
  if (endStr < startStr) return 0;
  const weekends = new Set((weekendDays ?? []).map(Number));
  let count = 0;
  let cursor = startStr;
  // safety cap — 1 saal se lambi range server par spin nahi karegi
  for (let i = 0; i < 366 && cursor <= endStr; i += 1) {
    const dow = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (!weekends.has(dow) && !holidaySet.has(cursor)) count += 1;
    const d = new Date(`${cursor}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return count;
}

/** Range ke har working day ka list (calendar UI ke liye). */
export function workingDaysOf(startStr, endStr, weekendDays, holidaySet) {
  const days = [];
  if (endStr < startStr) return days;
  const weekends = new Set((weekendDays ?? []).map(Number));
  let cursor = startStr;
  for (let i = 0; i < 366 && cursor <= endStr; i += 1) {
    const dow = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (!weekends.has(dow) && !holidaySet.has(cursor)) days.push(cursor);
    const d = new Date(`${cursor}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return days;
}

// ---------------------------------------------------------------------------
// Balances — quota − (approved + pending), year = start_date ka year
// ---------------------------------------------------------------------------

/**
 * leaveTypes rows + us year ke requests → per-type balance summary.
 * quota null (unpaid) = unlimited — remaining bhi null rahega.
 */
export function computeBalances(leaveTypes, yearRequests, year) {
  return leaveTypes.map((t) => {
    const mine = yearRequests.filter((r) => r.leave_type_id === t.id);
    const approved = mine
      .filter((r) => r.status === "approved")
      .reduce((s, r) => s + Number(r.days ?? 0), 0);
    const pending = mine
      .filter((r) => r.status === "pending")
      .reduce((s, r) => s + Number(r.days ?? 0), 0);
    const quota = t.yearly_quota == null ? null : Number(t.yearly_quota);
    const remaining = quota == null ? null : Math.max(0, quota - approved - pending);
    return {
      typeId: t.id,
      code: t.code,
      name: t.name,
      paid: Boolean(t.is_paid),
      quota,
      approved,
      pending,
      remaining,
      year,
    };
  });
}

/** Numeric-safe days compare — "3.5" jaisi values bhi theek. */
export function daysNum(v) {
  return Number(v ?? 0);
}

// ---------------------------------------------------------------------------
// Overlap — same employee ki pending/approved request se takrao
// ---------------------------------------------------------------------------

/**
 * Overlapping requests nikalo (classic interval overlap).
 * excludeId — decide/edit flows ke liye khud ko ignore karne ke liye.
 */
export function overlappingRequests(requests, startStr, endStr, excludeId = null) {
  return requests.filter(
    (r) =>
      r.id !== excludeId &&
      r.start_date <= endStr &&
      endStr >= r.start_date
  );
}

// ---------------------------------------------------------------------------
// Status meta — UI badges
// ---------------------------------------------------------------------------

export const LEAVE_STATUS_META = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "destructive" },
  cancelled: { label: "Cancelled", tone: "muted" },
};
