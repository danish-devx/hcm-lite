/**
 * Payroll service (Phase 6 — M6) — brief Section 3 ke exact rules:
 *
 *  Gross = 1.5 × basic (HRA 40% + medical 10%)
 *  Per day = gross ÷ working days
 *  Deduct = absent + unpaid + 0.5 × half days
 *  Prorate joiners/leavers (working days join/exit date se clip hote hain)
 *  Tax slab on gross × 12 (illustrative): 0–600k 0%; 5% to 1.2M;
 *    30k + 15% to 2.4M; 210k + 25% to 3.6M; 510k + 35% above. Monthly = /12.
 *  Admin finalizes; finalized runs locked.
 *
 * Sab functions PURE hain — API route data laa kar deta hai, service compute
 * karta hai (test + AI tools dono reuse karenge).
 */

import { addDaysStr, weekdayOf } from "@/lib/services/attendance.service";

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** UI display — PKR whole rupees with grouping (DB numeric strings safe). */
export function money(n) {
  return `PKR ${Math.round(Number(n ?? 0)).toLocaleString("en-US")}`;
}

// ---------------------------------------------------------------------------
// Tax slabs — brief ke illustrative slabs (annual gross × 12 basis)
// ---------------------------------------------------------------------------

export const TAX_SLABS = [
  { label: "0 – 600k", upTo: 600_000, from: 0, base: 0, rate: 0 },
  { label: "600k – 1.2M", upTo: 1_200_000, from: 600_000, base: 0, rate: 0.05 },
  { label: "1.2M – 2.4M", upTo: 2_400_000, from: 1_200_000, base: 30_000, rate: 0.15 },
  { label: "2.4M – 3.6M", upTo: 3_600_000, from: 2_400_000, base: 210_000, rate: 0.25 },
  { label: "3.6M +", upTo: Infinity, from: 3_600_000, base: 510_000, rate: 0.35 },
];

/**
 * Monthly tax — gross (monthly) × 12 slab me daal kar annual tax, /12.
 * Whole rupees me round (payslip clean rakhta hai).
 */
export function monthlyTaxFromGross(monthlyGross) {
  const annual = Number(monthlyGross ?? 0) * 12;
  const slab = TAX_SLABS.find((s) => annual <= s.upTo) ?? TAX_SLABS[TAX_SLABS.length - 1];
  const annualTax = slab.base + Math.max(0, annual - slab.from) * slab.rate;
  return Math.round(annualTax / 12);
}

/**
 * Late penalty rule (brief bonus: "3 lates = 0.5 day") — har 3 late check-ins
 * in the month fold into 0.5 deduction day. Pure helper taake payroll compute,
 * run-detail display aur payslip PDF sab SAME rule use karein.
 */
export const LATE_PENALTY = { latesPerUnit: 3, daysPerUnit: 0.5 };

export function latePenaltyDaysOf(lateCount) {
  return Math.floor(Math.max(0, Number(lateCount ?? 0)) / LATE_PENALTY.latesPerUnit) * LATE_PENALTY.daysPerUnit;
}

/**
 * Working-day late count — compute loop ke rule se 1:1 match. Weekend/holiday
 * par ka 'late' record payroll penalty me nahi ginta (compute loop skip karta
 * hai), is liye run-detail/payslip display bhi YAHI rule use kare taake chip
 * aur stored deductions kabhi mismatch na karein.
 */
export function workingDayLateCount(lateRows, { weekendDays = [0, 6], holidaySet = new Set() } = {}) {
  const weekends = new Set((weekendDays ?? []).map(Number));
  return (lateRows ?? []).filter((r) => {
    const dow = weekdayOf(r.date);
    return !weekends.has(dow) && !holidaySet.has(r.date);
  }).length;
}

/** Payslip/AI ke liye slab breakdown. */
export function taxSlabFor(monthlyGross) {
  const annual = Number(monthlyGross ?? 0) * 12;
  const slab = TAX_SLABS.find((s) => annual <= s.upTo) ?? TAX_SLABS[TAX_SLABS.length - 1];
  return { annual, slabLabel: slab.label, rate: slab.rate };
}

// ---------------------------------------------------------------------------
// Month helpers
// ---------------------------------------------------------------------------

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-10" → { start: "2026-10-01", end: "2026-10-31" } */
export function monthBounds(month) {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** "2026-10" → "October 2026" (payslip + UI titles). */
export function monthTitle(month) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

// ---------------------------------------------------------------------------
// Core computation — ek employee ka month
// ---------------------------------------------------------------------------

/**
 * Ek employee ka payroll item compute karo.
 *
 * @param {object} p
 * @param {object} p.employee           hcm_employees row (basic_salary, join_date, exit_date)
 * @param {string} p.month              "YYYY-MM"
 * @param {Array}  p.attendanceRows     usi employee ke month records (date, status)
 * @param {Array}  p.approvedLeaves     overlapping approved leaves [{start_date, end_date, paid}]
 * @param {number[]} p.weekendDays      [0,6] style
 * @param {Set}    p.holidaySet         month-spanning holiday dates
 * @param {string} p.todayStr           company-tz today (YYYY-MM-DD)
 * @returns item fields (DB row ready, employee_id NAHI — caller jodta hai)
 */
export function computeEmployeeItem({
  employee,
  month,
  attendanceRows = [],
  approvedLeaves = [],
  weekendDays = [0, 6],
  holidaySet = new Set(),
  todayStr,
}) {
  const weekends = new Set((weekendDays ?? []).map(Number));
  const { start, end } = monthBounds(month);
  const isCurrentMonth = month === todayStr.slice(0, 7);
  // Current month me sirf GUZRE din absent/unpaid count hote hain —
  // aane wale working days abhi kaam hue hi nahi.
  const absenceCutoff = isCurrentMonth ? addDaysStr(todayStr, -1) : end;

  const basic = Number(employee.basic_salary ?? 0);
  const gross = round2(basic * 1.5); // HRA 40% + medical 10%

  // ---- Proration: joiner/leaver clipping ----
  const effStart = employee.join_date && employee.join_date > start ? employee.join_date : start;
  const effEndRaw = employee.exit_date && employee.exit_date < end ? employee.exit_date : end;

  let workingDays = 0;
  let absent = 0;
  let unpaid = 0;
  let half = 0;
  let lates = 0;

  if (effEndRaw >= effStart) {
    // Absence sirf [effStart, min(effEnd, cutoff)] window me dekha jata hai
    const cutEnd = effEndRaw < absenceCutoff ? effEndRaw : absenceCutoff;

    const recByDate = new Map(attendanceRows.map((r) => [r.date, r]));
    const leaves = approvedLeaves.filter(
      (l) => l.end_date >= effStart && l.start_date <= cutEnd
    );

    let cursor = effStart;
    for (let i = 0; i < 366 && cursor <= effEndRaw; i += 1) {
      const dow = weekdayOf(cursor);
      if (!weekends.has(dow) && !holidaySet.has(cursor)) {
        workingDays += 1;
        if (cursor <= cutEnd) {
          const rec = recByDate.get(cursor);
          if (rec) {
            if (rec.status === "half_day") half += 1;
            else if (rec.status === "absent") absent += 1;
            else if (rec.status === "late") lates += 1;
            // present | missing_checkout → poora din
          } else {
            const lv = leaves.find((l) => l.start_date <= cursor && cursor <= l.end_date);
            if (lv) {
              if (!lv.paid) unpaid += 1; // approved paid leave → no deduction
            } else {
              absent += 1; // no record, no approved leave, day guzar gaya
            }
          }
        }
      }
      cursor = addDaysStr(cursor, 1);
    }
  }

  const perDay = workingDays > 0 ? gross / workingDays : 0;
  const latePenaltyDays = latePenaltyDaysOf(lates);
  const deductionDays = absent + unpaid + half * 0.5 + latePenaltyDays;
  const payableDays = Math.max(0, round2(workingDays - deductionDays));
  const deductions = round2(Math.min(perDay * deductionDays, gross)); // deduction gross se zyada nahi
  const earned = round2(gross - deductions); // per-day × payable
  const tax = monthlyTaxFromGross(gross); // slab FULL gross par (brief)
  const net = Math.max(0, round2(earned - tax)); // full-absent month → 0, negative kabhi nahi

  return {
    basic: round2(basic),
    gross,
    working_days: workingDays,
    payable_days: payableDays,
    absent_days: absent,
    unpaid_days: unpaid,
    half_days: half,
    late_days: lates,
    late_penalty_days: latePenaltyDays,
    deductions,
    tax,
    net,
    per_day: round2(perDay),
  };
}

// ---------------------------------------------------------------------------
// Status meta — UI badges
// ---------------------------------------------------------------------------

export const PAYROLL_STATUS_META = {
  draft: { label: "Draft", tone: "warning" },
  finalized: { label: "Finalized", tone: "success" },
};
