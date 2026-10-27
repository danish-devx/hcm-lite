/**
 * Phase 6 E2E API verification — payroll module (M6). IDEMPOTENT:
 * har run ek aisa month pick karta hai jis ka koi run nahi (2026-08 se
 * peeche), full draft→finalize→locked flow wahan chalata hai. DB trigger
 * finalized runs ko lock karta hai (delete bhi service-role se blocked) —
 * is liye finalized demo data (Sep 2026) ko touch nahi karta.
 *
 * Rules covered: gross=1.5×basic, working-days (weekend+holiday exclude),
 * absent/unpaid/half-day deductions, current-month cutoff, duplicate 409,
 * future 422, HR finalize 403, admin finalize → locked, employee RBAC,
 * payslip PDF access, /me scope.
 *
 * Run: node scripts/test_phase6_api.mjs
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

async function raw(cookie, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  const buf = await res.arrayBuffer();
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    bytes: buf.byteLength,
    head: Buffer.from(buf.slice(0, 5)).toString("latin1"),
  };
}

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
function taxOf(monthlyGross) {
  const annual = monthlyGross * 12;
  const slabs = [
    [600_000, 0, 0], [1_200_000, 0, 0.05], [2_400_000, 30_000, 0.15],
    [3_600_000, 210_000, 0.25], [Infinity, 510_000, 0.35],
  ];
  let prev = 0;
  for (const [upTo, base, rate] of slabs) {
    if (annual <= upTo) return Math.round((base + (annual - prev) * rate) / 12);
    prev = upTo;
  }
}

// ---------------------------------------------------------------------------
// Setup: logins, targets, test month pick
// ---------------------------------------------------------------------------
console.log("== Setup");
const admin = await login("admin.demo@example.com", "Test@1234");
const hr = await login("hr.demo@example.com", "Test@1234");
const emp = await login("employee.demo@example.com", "Test@1234");
check("admin login", admin.status === 200 && admin.cookie);
check("hr login", hr.status === 200 && hr.cookie);
check("employee login", emp.status === 200 && emp.cookie);

const { data: bilal } = await adminClient
  .from("hcm_employees").select("id, code, full_name, basic_salary, join_date").eq("email", "employee.demo@example.com").maybeSingle();
const { data: ayesha } = await adminClient
  .from("hcm_employees").select("id, code, full_name, basic_salary").eq("email", "ayesha.khan@bloom.test").maybeSingle();
console.log(`Targets: Bilal=${bilal?.code} (basic ${bilal?.basic_salary}) Ayesha=${ayesha?.code}`);

// Company tz today → current month
const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
const currentMonth = todayStr.slice(0, 7);

// Fresh test month: 2026-08 se peeche, jis par run nahi
let TEST_MONTH = null;
for (let i = 8; i >= 1; i -= 1) {
  const m = `2026-${String(i).padStart(2, "0")}`;
  const { data: exists } = await adminClient.from("hcm_payroll_runs").select("id").eq("month", m).maybeSingle();
  if (!exists) { TEST_MONTH = m; break; }
}
if (!TEST_MONTH) {
  console.log("Saare 2026 months used — cleanup karke dobara chalayein.");
  process.exit(1);
}
console.log(`Test month: ${TEST_MONTH} (current: ${currentMonth})`);

// Bilal ke liye test-month attendance seed: 18 present + 1 half + 3 absent
// (sirf test month ke liye — finalized runs ke months ko touch nahi karte)
{
  const [y, m] = TEST_MONTH.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const workingDays = [];
  for (let d = 1; d <= lastDay; d += 1) {
    const ds = `${TEST_MONTH}-${String(d).padStart(2, "0")}`;
    const dow = new Date(`${ds}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) workingDays.push(ds);
  }
  const absentDays = new Set(workingDays.slice(-3));
  const halfDay = workingDays[2];
  const rows = workingDays
    .filter((d) => !absentDays.has(d))
    .map((d) => ({
      employee_id: bilal.id,
      date: d,
      check_in: `${d}T04:00:00Z`,
      check_out: d === halfDay ? `${d}T07:00:00Z` : `${d}T13:00:00Z`,
      status: d === halfDay ? "half_day" : "present",
      source: "web",
      worked_minutes: d === halfDay ? 180 : 540,
    }));
  await adminClient.from("hcm_attendance").delete().eq("employee_id", bilal.id).gte("date", `${TEST_MONTH}-01`).lte("date", `${TEST_MONTH}-31`);
  const { error: seedErr } = await adminClient.from("hcm_attendance").insert(rows);
  console.log(seedErr ? `  (seed warn: ${seedErr.message})` : `Seeded Bilal ${TEST_MONTH} attendance: ${rows.length} rows (+1 half, +3 absent days)`);
}

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------
console.log("== RBAC");
check("anon runs 401", (await api("", "GET", "/api/payroll/runs")).status === 401);
check("employee runs 403", (await api(emp.cookie, "GET", "/api/payroll/runs")).status === 403);
check("employee create 403", (await api(emp.cookie, "POST", "/api/payroll/runs", { month: TEST_MONTH })).status === 403);

// ---------------------------------------------------------------------------
// Create run — TEST_MONTH (poora guzra month)
// ---------------------------------------------------------------------------
console.log(`== Create run (${TEST_MONTH})`);
let res = await api(hr.cookie, "POST", "/api/payroll/runs", { month: "bad-format" });
check("bad month 422", res.status === 422);
res = await api(hr.cookie, "POST", "/api/payroll/runs", { month: "2027-01" });
check("future month 422", res.status === 422);

res = await api(hr.cookie, "POST", "/api/payroll/runs", { month: TEST_MONTH });
check("HR creates draft 201", res.status === 201 && res.json?.data?.run?.status === "draft", JSON.stringify(res.json).slice(0, 120));
const runId = res.json?.data?.run?.id;

res = await api(admin.cookie, "POST", "/api/payroll/runs", { month: TEST_MONTH });
check("duplicate month 409", res.status === 409);

// ---------------------------------------------------------------------------
// Verify math — Bilal (basic 120000 → gross 180000)
// ---------------------------------------------------------------------------
console.log("== Item math (Bilal, basic 120000)");
res = await api(hr.cookie, "GET", `/api/payroll/runs/${runId}`);
const detail = res.json?.data;
check("detail 200 items>=1", res.status === 200 && (detail?.items?.length ?? 0) >= 1);
const bil = detail?.items?.find((i) => i.employee?.code === bilal.code);
if (bil) {
  console.log(`  Bilal: gross=${bil.gross} work=${bil.working_days} pay=${bil.payable_days} absent=${bil.absent_days} unpaid=${bil.unpaid_days} half=${bil.half_days} ded=${bil.deductions} tax=${bil.tax} net=${bil.net}`);
  const basic = Number(bilal.basic_salary);
  const gross = r2(basic * 1.5);
  check("gross = 1.5 × basic", Number(bil.gross) === gross, `got ${bil.gross} want ${gross}`);
  check("absent=3 half=1 unpaid=0", Number(bil.absent_days) === 3 && Number(bil.half_days) === 1 && Number(bil.unpaid_days) === 0, `${bil.absent_days}/${bil.half_days}/${bil.unpaid_days}`);
  const perDay = gross / bil.working_days;
  const dedDays = 3.5;
  const expectedDed = r2(Math.min(perDay * dedDays, gross));
  check("deductions = perDay × 3.5", r2(Number(bil.deductions)) === expectedDed, `got ${bil.deductions} want ${expectedDed}`);
  const expectedTax = taxOf(gross);
  check("tax = slab(gross×12)/12", Number(bil.tax) === expectedTax, `got ${bil.tax} want ${expectedTax}`);
  const expectedNet = Math.max(0, r2(gross - expectedDed - expectedTax));
  check("net = gross − deductions − tax (floor 0)", r2(Number(bil.net)) === expectedNet, `got ${bil.net} want ${expectedNet}`);
  check("payable = working − 3.5", r2(Number(bil.payable_days)) === r2(bil.working_days - 3.5));
} else {
  check("Bilal item exists", false);
}

// ---------------------------------------------------------------------------
// Employee visibility — draft invisible via /me, PDF blocked
// ---------------------------------------------------------------------------
console.log("== Employee scope (draft)");
res = await api(emp.cookie, "GET", "/api/payroll/me");
const preRows = res.json?.data?.rows ?? [];
check("/me linked", res.json?.data?.linked === true);
check("/me draft rows hidden", !preRows.some((r) => r.run?.month === TEST_MONTH));
const bilItemId = bil?.id;
res = await raw(emp.cookie, `/api/payroll/payslips/${bilItemId}/pdf`);
// Draft run employee ko INVISIBLE hai (runs RLS: staff-or-finalized) → 404;
// 403 bhi acceptable denial. Info-hiding > explicit 403.
check("employee draft PDF blocked (404 invisible | 403)", res.status === 404 || res.status === 403, `${res.status}`);
res = await raw(hr.cookie, `/api/payroll/payslips/${bilItemId}/pdf`);
check("staff draft PDF 200 (review)", res.status === 200 && res.contentType?.includes("pdf") && res.head === "%PDF-", `${res.status} ${res.bytes}b`);
console.log(`  staff draft pdf: ${res.bytes} bytes`);
res = await raw(hr.cookie, "/api/payroll/payslips/not-a-uuid/pdf");
check("bad item id 404 (not 500)", res.status === 404, `${res.status}`);

// ---------------------------------------------------------------------------
// HR cannot finalize; admin finalizes → locked
// ---------------------------------------------------------------------------
console.log("== Finalize");
res = await api(hr.cookie, "POST", `/api/payroll/runs/${runId}/finalize`);
check("HR finalize 403 (brief: HR cannot finalize)", res.status === 403);

res = await api(admin.cookie, "POST", `/api/payroll/runs/${runId}/finalize`);
check("admin finalize 200", res.status === 200 && res.json?.data?.run?.status === "finalized", JSON.stringify(res.json).slice(0, 120));

res = await api(admin.cookie, "POST", `/api/payroll/runs/${runId}/finalize`);
check("re-finalize 409", res.status === 409);
res = await api(admin.cookie, "POST", `/api/payroll/runs/${runId}/recalculate`);
check("finalized recalc 409 (locked)", res.status === 409);
res = await api(admin.cookie, "DELETE", `/api/payroll/runs/${runId}`);
check("finalized delete 409 (locked)", res.status === 409);

// ---------------------------------------------------------------------------
// Employee sees finalized payslip + downloads own PDF
// ---------------------------------------------------------------------------
console.log("== Employee payslips (finalized)");
res = await api(emp.cookie, "GET", "/api/payroll/me");
const myRows = res.json?.data?.rows ?? [];
const myTestRow = myRows.find((r) => r.run?.month === TEST_MONTH);
check("/me shows finalized row", Boolean(myTestRow) && myTestRow?.run?.status === "finalized");

res = await raw(emp.cookie, `/api/payroll/payslips/${bilItemId}/pdf`);
check("employee own PDF 200", res.status === 200 && res.head === "%PDF-", `${res.status}`);
console.log(`  employee pdf: ${res.bytes} bytes, ${res.contentType}`);

// kisi doosre ke item ki PDF → 403
res = await api(hr.cookie, "GET", `/api/payroll/runs/${runId}`);
const otherItem = (res.json?.data?.items ?? []).find((i) => i.employee?.code !== bilal.code);
if (otherItem) {
  res = await raw(emp.cookie, `/api/payroll/payslips/${otherItem.id}/pdf`);
  // Doosre employee ki item RLS own-only se invisible → 404 (ya 403)
  check("employee other PDF blocked (404 invisible | 403)", res.status === 404 || res.status === 403, `${res.status}`);
}

// ---------------------------------------------------------------------------
// Draft lifecycle — current month (recalc + delete)
// ---------------------------------------------------------------------------
console.log(`== Draft lifecycle (${currentMonth} — current month cutoff)`);
const { data: octExisting } = await adminClient.from("hcm_payroll_runs").select("id").eq("month", currentMonth).maybeSingle();
if (octExisting) {
  console.log(`  (${currentMonth} run pehle se hai — lifecycle section skip)`);
} else {
  res = await api(hr.cookie, "POST", "/api/payroll/runs", { month: currentMonth });
  check("current-month draft 201", res.status === 201);
  const curId = res.json?.data?.run?.id;

  res = await api(hr.cookie, "GET", `/api/payroll/runs/${curId}`);
  const curBil = (res.json?.data?.items ?? []).find((i) => i.employee?.code === bilal.code);
  if (curBil) {
    console.log(`  ${currentMonth} Bilal: work=${curBil.working_days} absent=${curBil.absent_days} (cutoff = yesterday)`);
    check("current-month cutoff: absences sirf guzre din", curBil.absent_days < curBil.working_days, `got ${curBil.absent_days}`);
  }

  res = await api(hr.cookie, "POST", `/api/payroll/runs/${curId}/recalculate`);
  check("HR recalc draft 200", res.status === 200);

  res = await api(admin.cookie, "DELETE", `/api/payroll/runs/${curId}`);
  check("admin delete draft 200", res.status === 200);
  res = await api(hr.cookie, "GET", `/api/payroll/runs/${curId}`);
  check("deleted run 404", res.status === 404);
}

// unlinked staff /me
const { data: hrProfile } = await adminClient.from("hcm_profiles").select("id, employee_id").eq("email", "hr.demo@example.com").maybeSingle();
if (!hrProfile?.employee_id) {
  res = await api(hr.cookie, "GET", "/api/payroll/me");
  check("unlinked staff /me linked:false", res.json?.data?.linked === false);
}

// ---------------------------------------------------------------------------
// Summary — finalized test-month run demo data ke tor par rehta hai
// ---------------------------------------------------------------------------
console.log(`\n== ${pass} pass, ${fail} fail`);
console.log(`Kept: ${TEST_MONTH} finalized run + ${currentMonth === "2026-10" ? "Sep" : "earlier"} demo data (payslip PDFs ready).`);
process.exit(fail > 0 ? 1 : 0);
