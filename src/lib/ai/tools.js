/**
 * AI tool registry (Phase 8 — M8). Brief: "The model never queries the
 * database directly. Tools reuse the same services and permission checks as
 * the REST API." — har tool requireAuth ke diye hue scoped context par
 * chalta hai: employee role ko sirf apna data milta hai, staff ko brief
 * access-matrix ke mutabiq company data.
 *
 * Tools (brief exact list): get_headcount, get_attendance_summary,
 * get_late_comers, get_leave_summary, get_my_leave_balance,
 * get_payroll_summary, search_employees.
 *
 * Contract: execute() kabhi throw NAHI karta — JSON-safe object return karta
 * hai; denial { not_allowed: reason }, failure { error: message }.
 */

import { addDays, attendanceRatePct, pct } from "@/lib/services/dashboard.service";
import { computeBalances, countWorkingDays, workingDaysOf } from "@/lib/services/leave.service";
import { wallParts } from "@/lib/services/attendance.service";

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 190;

const DEFAULTS = {
  select:
    "id, code, full_name, email, department_id, designation_id, join_date, exit_date, status, gender, basic_salary",
};

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

function isActiveOn(e, date) {
  return e.status === "active" && e.join_date <= date && (!e.exit_date || e.exit_date > date);
}

function clampRange(from, to, today) {
  let f = /^\d{4}-\d{2}-\d{2}$/.test(from ?? "") ? from : `${today.slice(0, 4)}-01-01`;
  let t = /^\d{4}-\d{2}-\d{2}$/.test(to ?? "") ? to : today;
  if (t > today) t = today;
  if (f > t) f = t;
  if (f < addDays(today, -MAX_RANGE_DAYS)) f = addDays(today, -MAX_RANGE_DAYS);
  return { from: f, to: t };
}

/** "2026-03" ya "this_month" jaisi values bhi qabool. */
function normalizeMonth(value, today) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v || v === "this_month" || v === "current") return today.slice(0, 7);
  if (v === "last_month" || v === "previous") {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  }
  const m = v.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : today.slice(0, 7);
}

async function loadContext(ctx) {
  const { supabase } = ctx;
  const [deptRes, desigRes, empRes, typeRes] = await Promise.all([
    supabase.from("hcm_departments").select("id, name"),
    supabase.from("hcm_designations").select("id, name"),
    supabase.from("hcm_employees").select(DEFAULTS.select),
    supabase.from("hcm_leave_types").select("id, code, name, yearly_quota, is_paid"),
  ]);
  if (deptRes.error || empRes.error || typeRes.error) {
    return { error: deptRes.error?.message ?? empRes.error?.message ?? typeRes.error?.message };
  }
  const employees = empRes.data ?? [];
  const isStaff = ctx.profile.role === "admin" || ctx.profile.role === "hr";
  const scoped = isStaff ? employees : employees.filter((e) => e.id === ctx.profile.employee_id);
  return {
    employees,
    scoped,
    isStaff,
    deptName: new Map((deptRes.data ?? []).map((d) => [d.id, d.name])),
    desigName: new Map((desigRes.data ?? []).map((d) => [d.id, d.name])),
    leaveTypes: typeRes.data ?? [],
  };
}

function deptOf(e, deptName) {
  return e?.department_id ? (deptName.get(e.department_id) ?? "Unassigned") : "Unassigned";
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

/** 1. get_headcount — staff: total + per-dept (+ gender); employee: total only. */
async function headcount(args, ctx) {
  const c = await loadContext(ctx);
  if (c.error) return { error: c.error };
  const { scoped, isStaff, deptName } = c;

  let list = scoped;
  const dep = String(args?.department ?? "").trim();
  if (dep && dep !== "all" && isStaff) {
    const wanted = dep.toLowerCase();
    list = scoped.filter((e) => deptOf(e, deptName).toLowerCase().includes(wanted));
  }

  const today = ctx.today;
  const active = list.filter((e) => isActiveOn(e, today));
  const result = {
    asOf: today,
    totalActive: active.length,
  };

  if (isStaff) {
    result.byDepartment = {};
    for (const e of active) {
      const name = deptOf(e, deptName);
      result.byDepartment[name] = (result.byDepartment[name] ?? 0) + 1;
    }
    result.byGender = { male: 0, female: 0, other_or_unset: 0 };
    for (const e of active) {
      const g = String(e.gender ?? "").toLowerCase();
      if (g === "male" || g === "female") result.byGender[g] += 1;
      else result.byGender.other_or_unset += 1;
    }
  }
  return result;
}

/** 2. get_attendance_summary — staff: company range stats; employee: own. */
async function attendanceSummary(args, ctx) {
  const c = await loadContext(ctx);
  if (c.error) return { error: c.error };
  const { scoped, isStaff } = c;
  const { supabase, today, weekendDays } = ctx;

  const { from, to } = clampRange(args?.from, args?.to, today);

  const ids = new Set(scoped.map((e) => e.id));
  const [attRes, holRes, leaveRes] = await Promise.all([
    supabase
      .from("hcm_attendance")
      .select("employee_id, date, status")
      .gte("date", from)
      .lte("date", to),
    supabase.from("hcm_holidays").select("date").gte("date", from).lte("date", to),
    supabase
      .from("hcm_leave_requests")
      .select("employee_id, start_date, end_date, status")
      .eq("status", "approved")
      .lte("start_date", to)
      .gte("end_date", from),
  ]);
  if (attRes.error || holRes.error || leaveRes.error) {
    return { error: attRes.error?.message ?? holRes.error?.message ?? leaveRes.error?.message };
  }

  const weekends = new Set((weekendDays ?? [0, 6]).map(Number));
  const holidays = new Set((holRes.data ?? []).map((h) => h.date));
  const recordsByDate = new Map();
  for (const r of attRes.data ?? []) {
    if (!ids.has(r.employee_id)) continue;
    if (!recordsByDate.has(r.date)) recordsByDate.set(r.date, []);
    recordsByDate.get(r.date).push(r);
  }
  const leaveByDate = new Map();
  for (const l of leaveRes.data ?? []) {
    if (!ids.has(l.employee_id)) continue;
    let cursor = l.start_date > from ? l.start_date : from;
    const end = l.end_date < to ? l.end_date : to;
    for (let i = 0; i < 370 && cursor <= end; i += 1) {
      if (!weekends.has(new Date(`${cursor}T00:00:00Z`).getUTCDay()) && !holidays.has(cursor)) {
        leaveByDate.set(cursor, (leaveByDate.get(cursor) ?? 0) + 1);
      }
      cursor = addDays(cursor, 1);
    }
  }

  const counts = { present: 0, late: 0, half_day: 0, missing_checkout: 0, absent: 0, on_leave: 0 };
  let workingDayRecords = 0;
  let cursor = from;
  for (let i = 0; i < 380 && cursor <= to; i += 1) {
    const dow = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (!weekends.has(dow) && !holidays.has(cursor)) {
      const records = recordsByDate.get(cursor) ?? [];
      for (const r of records) {
        const s = r.status ?? "present";
        if (s in counts) counts[s] += 1;
        else counts.present += 1;
      }
      const onLeave = leaveByDate.get(cursor) ?? 0;
      counts.on_leave += onLeave;
      const expected = scoped.filter((e) => isActiveOn(e, cursor)).length;
      workingDayRecords += expected;
      if (cursor < today) {
        counts.absent += Math.max(0, expected - records.length - onLeave);
      }
    }
    cursor = addDays(cursor, 1);
  }

  const who = isStaff ? "Company" : "Your";
  return {
    scope: isStaff ? "company" : "self",
    range: { from, to },
    [`${who.toLowerCase()}_attendance`]: counts,
    attendanceRatePct: attendanceRatePct({ ...counts, workingDayRecords }),
    note: "Rate = (present + late + missing_checkout + 0.5 × half_day) ÷ (working-day records − on_leave)",
  };
}

/** 3. get_late_comers — SIRF admin/hr (employee ko not_allowed). */
async function lateComers(args, ctx) {
  if (ctx.profile.role === "employee") {
    return { not_allowed: "Late-comer insights are staff-only. You can ask about your own attendance." };
  }
  const c = await loadContext(ctx);
  if (c.error) return { error: c.error };
  const { employees, deptName } = c;
  const { supabase, today, tz } = ctx;

  const { from, to } = clampRange(args?.from, args?.to, today);
  const { data, error } = await supabase
    .from("hcm_attendance")
    .select("employee_id, date, check_in, status")
    .eq("status", "late")
    .gte("date", from)
    .lte("date", to);
  if (error) return { error: error.message };

  const byEmp = new Map();
  for (const r of data ?? []) {
    const entry = byEmp.get(r.employee_id) ?? { count: 0, minutes: [] };
    entry.count += 1;
    if (r.check_in) {
      const p = wallParts(new Date(r.check_in), tz);
      entry.minutes.push(p.hour * 60 + p.minute);
    }
    byEmp.set(r.employee_id, entry);
  }
  const empById = new Map(employees.map((e) => [e.id, e]));
  const top = [...byEmp.entries()]
    .map(([id, v]) => {
      const e = empById.get(id);
      const avgMin = v.minutes.length
        ? Math.round(v.minutes.reduce((s, n) => s + n, 0) / v.minutes.length)
        : null;
      return {
        name: e?.full_name ?? "Unknown",
        code: e?.code ?? "—",
        department: e ? deptOf(e, deptName) : "—",
        lateCount: v.count,
        avgCheckIn: avgMin == null
          ? null
          : `${String(Math.floor(avgMin / 60) % 24).padStart(2, "0")}:${String(avgMin % 60).padStart(2, "0")}`,
      };
    })
    .sort((a, b) => b.lateCount - a.lateCount || a.name.localeCompare(b.name))
    .slice(0, 5);

  return { range: { from, to }, topLateComers: top };
}

/** 4. get_leave_summary — staff: on-leave today + pending + per-type; employee: own. */
async function leaveSummary(args, ctx) {
  const c = await loadContext(ctx);
  if (c.error) return { error: c.error };
  const { scoped, isStaff, leaveTypes, deptName } = c;
  const { supabase, today } = ctx;

  const ids = new Set(scoped.map((e) => e.id));
  const year = today.slice(0, 4);
  const [reqRes, holRes] = await Promise.all([
    supabase
      .from("hcm_leave_requests")
      .select("employee_id, leave_type_id, start_date, end_date, days, status, reason")
      .in("status", ["pending", "approved"])
      .gte("end_date", `${year}-01-01`),
    supabase.from("hcm_holidays").select("date").gte("date", `${year}-01-01`).lte("date", `${year}-12-31`),
  ]);
  if (reqRes.error || holRes.error) return { error: reqRes.error?.message ?? holRes.error?.message };

  const holidaySet = new Set((holRes.data ?? []).map((h) => h.date));
  const weekends = (ctx.weekendDays ?? [0, 6]).map(Number);
  const requests = (reqRes.data ?? []).filter((r) => ids.has(r.employee_id));
  const empById = new Map(c.employees.map((e) => [e.id, e]));

  const onLeaveToday = requests
    .filter((r) => r.status === "approved" && r.start_date <= today && r.end_date >= today)
    .map((r) => ({
      name: empById.get(r.employee_id)?.full_name ?? "Unknown",
      department: empById.get(r.employee_id) ? deptOf(empById.get(r.employee_id), deptName) : "—",
    }));

  const perType = {};
  let pendingCount = 0;
  for (const r of requests) {
    const t = leaveTypes.find((x) => x.id === r.leave_type_id);
    const key = t?.name ?? "Unknown";
    perType[key] = perType[key] ?? { approvedDays: 0, pendingDays: 0, quota: null };
    if (r.status === "pending") {
      pendingCount += 1;
      perType[key].pendingDays += Number(r.days ?? 0);
    } else {
      perType[key].approvedDays += Number(r.days ?? 0);
    }
    if (t?.yearly_quota != null) perType[key].quota = Number(t.yearly_quota);
  }

  const result = {
    today,
    scope: isStaff ? "company" : "self",
    onLeaveToday: isStaff ? onLeaveToday : onLeaveToday.filter(() => false),
    pendingRequests: pendingCount,
    byType: perType,
  };
  if (!isStaff) delete result.onLeaveToday;

  if (isStaff) {
    const activeCount = Math.max(1, scoped.filter((e) => isActiveOn(e, today)).length);
    for (const k of Object.keys(result.byType)) {
      const q = result.byType[k].quota;
      result.byType[k].utilizationPct = q ? pct(result.byType[k].approvedDays, q * activeCount) : null;
    }
  } else {
    const mine = requests.filter((r) => r.employee_id === ctx.profile.employee_id);
    const balances = computeBalances(leaveTypes, mine, Number(year));
    result.myBalances = balances.map((b) => ({
      type: b.name,
      quota: b.quota,
      approved: b.approved,
      pending: b.pending,
      remaining: b.remaining,
    }));
  }
  return result;
}

/** 5. get_my_leave_balance — employee-link zaruRI (staff ka linked bhi chalega). */
async function myLeaveBalance(_args, ctx) {
  if (!ctx.profile.employee_id) {
    return { not_allowed: "This login is not linked to an employee record." };
  }
  const c = await loadContext(ctx);
  if (c.error) return { error: c.error };
  const { supabase, today } = ctx;
  const year = today.slice(0, 4);
  const { data, error } = await supabase
    .from("hcm_leave_requests")
    .select("leave_type_id, days, status, start_date")
    .eq("employee_id", ctx.profile.employee_id)
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`);
  if (error) return { error: error.message };

  const balances = computeBalances(c.leaveTypes, data ?? [], Number(year));
  return {
    year: Number(year),
    balances: balances.map((b) => ({
      type: b.name,
      quota: b.quota,
      used: b.approved,
      pending: b.pending,
      remaining: b.remaining,
    })),
    note: "remaining = quota − (approved + pending) us year me; unlimited types ka remaining null",
  };
}

/** 6. get_payroll_summary — staff: run totals; employee: apne payslips. */
async function payrollSummary(args, ctx) {
  const isStaff = ctx.profile.role === "admin" || ctx.profile.role === "hr";
  const { supabase } = ctx;

  if (isStaff) {
    const { data, error } = await supabase
      .from("hcm_payroll_runs")
      .select("id, month, status, created_at")
      .order("month", { ascending: false })
      .limit(12);
    if (error) return { error: error.message };
    if (!data?.length) return { months: [], note: "No payroll runs yet." };

    const months = [];
    for (const run of data.slice(0, 6)) {
      const { data: items, error: itErr } = await supabase
        .from("hcm_payroll_items")
        .select("gross, net, deductions")
        .eq("run_id", run.id);
      if (itErr) return { error: itErr.message };
      months.push({
        month: run.month,
        status: run.status,
        employees: (items ?? []).length,
        grossTotal: (items ?? []).reduce((s, i) => s + Number(i.gross ?? 0), 0),
        netTotal: (items ?? []).reduce((s, i) => s + Number(i.net ?? 0), 0),
        deductionTotal: (items ?? []).reduce((s, i) => s + Number(i.deductions ?? 0), 0),
      });
    }
    return { months, currency: "PKR", note: "Dashboard 'payroll cost' sirf FINALIZED months count karta hai." };
  }

  // employee — sirf apne finalized payslips
  if (!ctx.profile.employee_id) return { not_allowed: "This login is not linked to an employee record." };
  const { data: mine, error } = await supabase
    .from("hcm_payroll_items")
    .select("month, gross, net, deductions, status")
    .eq("employee_id", ctx.profile.employee_id)
    .eq("status", "finalized")
    .order("month", { ascending: false })
    .limit(6);
  if (error) return { error: error.message };
  return {
    myPayslips: (mine ?? []).map((p) => ({
      month: p.month,
      gross: Number(p.gross ?? 0),
      net: Number(p.net ?? 0),
      currency: "PKR",
    })),
  };
}

/** 7. search_employees — staff: directory search (+salary); employee: sirf khud. */
async function searchEmployees(args, ctx) {
  const c = await loadContext(ctx);
  if (c.error) return { error: c.error };
  const { employees, scoped, isStaff, deptName, desigName } = c;
  const { today } = ctx;

  if (!isStaff) {
    const me = employees.find((e) => e.id === ctx.profile.employee_id);
    if (!me) return { not_allowed: "This login is not linked to an employee record." };
    return {
      results: [
        {
          name: me.full_name,
          code: me.code,
          department: deptOf(me, deptName),
          designation: me.designation_id ? (desigName.get(me.designation_id) ?? "—") : "—",
          status: me.status,
          basicSalary: ctx.employee?.basic_salary ?? null,
          note: "Your own record. Colleague search is not available on employee accounts.",
        },
      ],
    };
  }

  const q = String(args?.query ?? "").trim().toLowerCase();
  const dep = String(args?.department ?? "").trim().toLowerCase();
  const limit = Math.min(8, Math.max(1, Number(args?.limit ?? 6) || 6));

  let list = scoped;
  if (dep && dep !== "all") list = list.filter((e) => deptOf(e, deptName).toLowerCase().includes(dep));
  if (q) {
    list = list.filter((e) =>
      [e.full_name, e.code, e.email ?? "", e.designation_id ? (desigName.get(e.designation_id) ?? "") : ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  return {
    matched: list.length,
    results: list.slice(0, limit).map((e) => ({
      name: e.full_name,
      code: e.code,
      department: deptOf(e, deptName),
      designation: e.designation_id ? (desigName.get(e.designation_id) ?? "—") : "—",
      status: e.status,
      joined: e.join_date,
      tenureYears: e.join_date
        ? Math.max(0, Math.round(((new Date(`${today}T00:00:00Z`) - new Date(`${e.join_date}T00:00:00Z`)) / DAY_MS / 365.25) * 10) / 10)
        : null,
      basicSalary: e.basic_salary ?? null,
    })),
    note: "Salary visible to staff only — employee role kabhi nahi.",
  };
}

// ---------------------------------------------------------------------------
// Registry — descriptions model ko tool choice karne ke liye
// ---------------------------------------------------------------------------

const REGISTRY = [
  {
    name: "get_headcount",
    description: "Active employees count — total, by department, by gender (gender staff-only). Use for 'how many employees...'.",
    parameters: {
      type: "object",
      properties: {
        department: { type: "string", description: "Department name filter, e.g. 'Engineering'. Omit for all." },
      },
      required: [],
    },
    execute: headcount,
  },
  {
    name: "get_attendance_summary",
    description: "Attendance stats for a date range: present/late/half_day/missing_checkout/absent/on_leave counts + attendance rate. Use for 'attendance rate this month'.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD (default: Jan 1 this year)" },
        to: { type: "string", description: "YYYY-MM-DD (default: today)" },
      },
      required: [],
    },
    execute: attendanceSummary,
  },
  {
    name: "get_late_comers",
    description: "Top 5 late-comers in a range with counts and average check-in time. Staff-only.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
      },
      required: [],
    },
    execute: lateComers,
  },
  {
    name: "get_leave_summary",
    description: "Leave picture: who is on leave today (staff), pending request count, per-type approved/pending days + utilization. Use for 'who is on leave today'.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: leaveSummary,
  },
  {
    name: "get_my_leave_balance",
    description: "The logged-in person's own leave balances (quota, used, pending, remaining) for this year.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: myLeaveBalance,
  },
  {
    name: "get_payroll_summary",
    description: "Payroll: staff sees run totals per month (status, gross/net); employee sees own finalized payslips (gross/net). Use for 'payroll cost', 'my salary slip'.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: payrollSummary,
  },
  {
    name: "search_employees",
    description: "Find employees by name/code/role with department, designation, tenure. Staff sees basic salary; employee sees only their own record.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, code or designation text to match" },
        department: { type: "string", description: "Department name filter" },
        limit: { type: "number", description: "Max results (1-8, default 6)" },
      },
      required: [],
    },
    execute: searchEmployees,
  },
];

export const AI_TOOLS = REGISTRY;

/** Tool execute wrapper — name resolve + hard 2.5s guard + error capture. */
export async function runAiTool(name, args, ctx) {
  const tool = REGISTRY.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool "${name}"` };
  const started = Date.now();
  try {
    const result = await Promise.race([
      tool.execute(args ?? {}, ctx),
      new Promise((_, rej) => setTimeout(() => rej(new Error("tool timeout")), 2500)),
    ]);
    return { ...result, _ms: Date.now() - started };
  } catch (err) {
    return { error: err?.message ?? "tool failed", _ms: Date.now() - started };
  }
}

// ---------------------------------------------------------------------------
// Smart-leave helpers (route use karta hai) — keyword type matching
// ---------------------------------------------------------------------------

const TYPE_KEYWORDS = [
  { code: "casual", words: ["casual", "wedding", "shaadi", "family", "personal", "errand"] },
  { code: "sick", words: ["sick", "ill", "fever", "medical", "doctor", "hospital", "bimar", "tabiyat"] },
  { code: "annual", words: ["annual", "vacation", "holiday trip", "tour", "umrah", "hajj", "chhutti"] },
  { code: "unpaid", words: ["unpaid", "unpaid leave", "bina tankha"] },
];

/** Text + available types → best matching leave type row ya null. */
export function matchLeaveType(text, types, suggestedCode) {
  const list = types ?? [];
  if (suggestedCode) {
    const byCode = list.find(
      (t) => t.code?.toLowerCase() === String(suggestedCode).toLowerCase()
    );
    if (byCode) return byCode;
    const byName = list.find(
      (t) => String(t.name).toLowerCase().includes(String(suggestedCode).toLowerCase())
    );
    if (byName) return byName;
  }
  const lower = String(text ?? "").toLowerCase();
  for (const kw of TYPE_KEYWORDS) {
    if (kw.words.some((w) => lower.includes(w))) {
      const hit = list.find((t) => t.code?.toLowerCase().includes(kw.code));
      if (hit) return hit;
    }
  }
  return null;
}

export { countWorkingDays, workingDaysOf };
