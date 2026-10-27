/**
 * Phase 7 E2E API verification — Dashboards & Analytics (M7, F18).
 *
 * Covered: RBAC (anon 401, employee 403 on admin, hr-view ok for admin),
 * admin KPIs + payroll math cross-check against DB, headcount/payroll by
 * dept, gender/tenure, audit feed; HR today-KPIs, attendance trend,
 * absenteeism, leave by type, top late-comers; me route (week hours,
 * late count, balances, last payslip); date-range + department filters.
 *
 * Run: node scripts/test_phase7_api.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const adminClient = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ FAIL: ${name} ${extra}`);
  }
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).filter((c) => c.includes("=")).join("; ");
  return { status: res.status, cookie };
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const DEMO = { admin: "admin.demo@example.com", hr: "hr.demo@example.com", employee: "employee.demo@example.com" };

console.log("\n== Login ==");
const admin = await login(DEMO.admin, "Test@1234");
const hr = await login(DEMO.hr, "Test@1234");
const employee = await login(DEMO.employee, "Test@1234");
check("admin login 200", admin.status === 200);
check("hr login 200", hr.status === 200);
check("employee login 200", employee.status === 200);

console.log("\n== RBAC ==");
const anonAdmin = await api(null, "GET", "/api/dashboard/admin");
check("anon admin dashboard 401", anonAdmin.status === 401);
const anonHr = await api(null, "GET", "/api/dashboard/hr");
check("anon hr dashboard 401", anonHr.status === 401);
const empAdmin = await api(employee.cookie, "GET", "/api/dashboard/admin");
check("employee admin dashboard 403", empAdmin.status === 403);
const empHr = await api(employee.cookie, "GET", "/api/dashboard/hr");
check("employee hr dashboard 403", empHr.status === 403);

console.log("\n== Admin dashboard shape ==");
const adm = await api(admin.cookie, "GET", "/api/dashboard/admin");
check("admin 200", adm.status === 200);
const ad = adm.json?.data ?? {};
check("kpis present", !!ad.kpis && Number.isFinite(ad.kpis.headcount));
check("headcount > 0", ad.kpis?.headcount > 0, JSON.stringify(ad.kpis));
check("payrollCost > 0 (finalized Jun–Oct exist)", ad.kpis?.payrollCost > 0);
check("avgSalaryGross > 0", ad.kpis?.avgSalaryGross > 0);
check("headcountByDept array", Array.isArray(ad.headcountByDept) && ad.headcountByDept.length > 0);
check("payrollByDept array", Array.isArray(ad.payrollByDept) && ad.payrollByDept.length > 0);
check("payrollTrend months > 0", (ad.payrollTrend ?? []).length > 0);
check("gender 4 buckets", (ad.gender ?? []).length === 4);
check("tenure 4 buckets", (ad.tenure ?? []).length === 4);
check("auditFeed ≤ 8 rows", Array.isArray(ad.auditFeed) && ad.auditFeed.length > 0 && ad.auditFeed.length <= 8);
check("range defaults YTD", ad.range?.from === `${ad.today?.slice(0, 4)}-01-01`, JSON.stringify(ad.range));

// Cross-check payroll cost against direct DB sum
const { data: runs } = await adminClient
  .from("hcm_payroll_runs")
  .select("id, month, status, hcm_payroll_items ( net )")
  .eq("status", "finalized")
  .gte("month", `${ad.today.slice(0, 4)}-01-01`.slice(0, 7))
  .lte("month", ad.today.slice(0, 7));
const dbNet = (runs ?? []).reduce(
  (s, r) => s + (r.hcm_payroll_items ?? []).reduce((x, i) => x + Number(i.net ?? 0), 0),
  0
);
check(
  "payrollCost matches DB sum",
  Math.abs(ad.kpis.payrollCost - dbNet) < 1,
  `api=${ad.kpis.payrollCost} db=${dbNet}`
);

console.log("\n== Admin filters ==");
const { data: depts } = await adminClient.from("hcm_departments").select("id, name");
const eng = depts?.[0];
const admEng = await api(admin.cookie, "GET", `/api/dashboard/admin?department=${eng.id}`);
check("dept filter 200", admEng.status === 200);
check("dept filter → single dept chart", (admEng.json?.data?.headcountByDept ?? []).every((d) => d.name === eng.name));
const { data: engEmps } = await adminClient.from("hcm_employees").select("id").eq("department_id", eng.id);
check(
  "dept headcount matches DB",
  admEng.json?.data?.kpis?.headcount === (engEmps ?? []).filter(Boolean).length,
  `api=${admEng.json?.data?.kpis?.headcount} db=${engEmps?.length}`
);
const adm30 = await api(admin.cookie, "GET", `/api/dashboard/admin?from=${ad.today}&to=${ad.today}`);
const trendMonths = (adm30.json?.data?.payrollTrend ?? []).map((p) => p.month);
check(
  "single-day range → payroll months clamped to today's month",
  trendMonths.every((m) => m === ad.today.slice(0, 7)) && trendMonths.length <= 1,
  JSON.stringify(trendMonths)
);
const badRange = await api(admin.cookie, "GET", `/api/dashboard/admin?from=garbage&to=2026-13-99`);
check("garbage dates fall back to YTD safely", badRange.status === 200 && !!badRange.json?.data?.range);

console.log("\n== HR dashboard shape ==");
const hrr = await api(hr.cookie, "GET", "/api/dashboard/hr");
check("hr 200", hrr.status === 200);
const hd = hrr.json?.data ?? {};
check("kpis present", !!hd.kpis);
check("headcount > 0", hd.kpis?.headcount > 0);
check("today set", hd.today === ad.today);
check("trend array", Array.isArray(hd.trend));
check("trend has working days only (no weekend dates)", (hd.trend ?? []).every((t) => {
  const dow = new Date(`${t.date}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6;
}));
check("absenteeismByDept array", Array.isArray(hd.absenteeismByDept) && hd.absenteeismByDept.length > 0);
check("leaveByType array w/ utilization fields", (hd.leaveByType ?? []).every((t) => "utilization" in t && "approvedDays" in t));
check("topLateComers ≤ 5", (hd.topLateComers ?? []).length <= 5);
check("isWorkingDayToday boolean", typeof hd.isWorkingDayToday === "boolean");

// Trend math cross-check: total present in trend == DB attendance present rows in range
const { data: attRows } = await adminClient
  .from("hcm_attendance")
  .select("date, status")
  .gte("date", hd.range.from)
  .lte("date", hd.range.to);
const dbPresent = (attRows ?? []).filter((r) => r.status === "present").length;
const apiPresent = (hd.trend ?? []).reduce((s, t) => s + t.present, 0);
check("trend present total matches DB", dbPresent === apiPresent, `db=${dbPresent} api=${apiPresent}`);

console.log("\n== HR filters ==");
const hrEng = await api(hr.cookie, "GET", `/api/dashboard/hr?department=${eng.id}`);
check("hr dept filter 200", hrEng.status === 200);
check("hr dept headcount consistent", hrEng.json?.data?.kpis?.headcount === admEng.json?.data?.kpis?.headcount);
const yr2025 = await api(hr.cookie, "GET", "/api/dashboard/hr?from=2025-01-01&to=2025-12-31");
check("past year range 200 (mostly empty trend ok)", yr2025.status === 200);

console.log("\n== Employee personal dashboard (/me) ==");
const me = await api(employee.cookie, "GET", "/api/dashboard/me");
check("employee /me 200", me.status === 200);
const md = me.json?.data ?? {};
check("linked true", md.linked === true);
check("week object w/ 7 byDay", (md.week?.byDay ?? []).length === 7);
check("target 2400 minutes", md.week?.targetMinutes === 2400);
check("workedMinutes finite", Number.isFinite(md.week?.workedMinutes));
check("lateCount finite", Number.isFinite(md.lateCount));
check("balances array", Array.isArray(md.balances) && md.balances.length > 0);
check("lastPayslip present (finalized runs exist)", !!md.lastPayslip && Number.isFinite(md.lastPayslip.net));

// Cross-check lastPayslip against DB
const { data: myEmp } = await adminClient
  .from("hcm_employees")
  .select("id")
  .eq("email", DEMO.employee)
  .maybeSingle();
const { data: lastItem } = await adminClient
  .from("hcm_payroll_items")
  .select("id, net, hcm_payroll_runs!inner ( month, status )")
  .eq("employee_id", myEmp.id)
  .eq("hcm_payroll_runs.status", "finalized")
  .order("id", { ascending: false })
  .limit(1);
check(
  "lastPayslip matches DB",
  lastItem?.[0] ? Math.abs(md.lastPayslip.net - Number(lastItem[0].net)) < 1 && md.lastPayslip.month === lastItem[0].hcm_payroll_runs.month : !md.lastPayslip,
  JSON.stringify({ api: md.lastPayslip, db: lastItem?.[0]?.net })
);

// Unlinked staff on /me
const hrMe = await api(hr.cookie, "GET", "/api/dashboard/me");
check("unlinked staff /me → linked:false", hrMe.status === 200 && hrMe.json?.data?.linked === false);
const anonMe = await api(null, "GET", "/api/dashboard/me");
check("anon /me 401", anonMe.status === 401);

console.log(`\n=== RESULT: ${pass} pass, ${fail} fail ===`);
process.exit(fail ? 1 : 0);
