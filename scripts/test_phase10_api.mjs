/**
 * Phase 10 E2E API verification — Bonus + Ship (final phase).
 * Covers: late penalty rule (3 lates = 0.5 day) end-to-end (seed → draft run →
 * detail lateInfo → PDF), camera GPS-accuracy guard, attrition risk (admin),
 * absence anomaly flags (HR), PWA manifest, regression on dashboards.
 *
 * IDEMPOTENT: 2026-05 draft run (koi aur run us month me nahi) create → verify
 * → DELETE draft at the end. May lates seed upsert-style (delete then insert).
 * Run: node scripts/test_phase10_api.mjs   (dev server localhost:3000 chahiye)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const sbAdmin = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"));

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, extra = "") {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function api(cookie, path, body, method, timeout = 60_000) {
  const res = await fetch(`${BASE}${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON (PDF etc.) */
  }
  return { status: res.status, json, res };
}

// ===========================================================================
console.log("\n== 1. Logins + PWA assets ==");
const admin = await login("admin.demo@example.com", "Test@1234");
const hr = await login("hr.demo@example.com", "Test@1234");
const emp = await login("employee.demo@example.com", "Test@1234");
check("admin login", Boolean(admin));
check("hr login", Boolean(hr));
check("employee login", Boolean(emp));

const manifest = await fetch(`${BASE}/manifest.webmanifest`);
check("manifest.webmanifest 200 + JSON", manifest.status === 200 && (await manifest.json()).start_url === "/dashboard");
check("icon-192 200", (await fetch(`${BASE}/icon-192.png`)).status === 200);
check("face model public 200", (await fetch(`${BASE}/models/blaze_face_short_range.tflite`)).status === 200);

// ===========================================================================
console.log("\n== 2. Camera GPS-accuracy guard (bonus, brief: reject > 100 m) ==");
{
  const r = await api(emp, "/api/attendance/check-in", {
    source: "camera",
    lat: 24.86,
    lng: 67.0,
    accuracy: 250,
  });
  check("camera + accuracy 250 m → 422", r.status === 422, `got ${r.status} ${JSON.stringify(r.json)?.slice(0, 120)}`);
  const web = await api(emp, "/api/attendance/check-in", { source: "web", lat: 24.86, lng: 67.0, accuracy: 250 });
  check(
    "web lenient (koi 100 m guard nahi) — 409 ya 201/422-geofence, NOT accuracy-422",
    web.status !== 422 || !String(web.json?.message ?? "").includes("100 m"),
    `got ${web.status}`
  );
}

// ===========================================================================
console.log("\n== 3. Late penalty rule (3 lates = 0.5 day) — fresh past month draft run ==");
let runId = null;
{
  // Dynamic month pick: pehla 2026 month jis par koi run NAHI (idempotent re-runs)
  const runsList = await api(admin, "/api/payroll/runs");
  const usedMonths = new Set((runsList.json?.data?.rows ?? []).map((r) => r.month));
  const MONTH = ["2026-05", "2026-04", "2026-03", "2026-02", "2026-06", "2026-01"].find((m) => !usedMonths.has(m));
  if (!MONTH) throw new Error("koi free month nahi mila test ke liye");
  console.log(`  (month: ${MONTH})`);
  // cleanup from previous runs of THIS test
  const existing = await api(admin, "/api/payroll/runs");
  const prev = (existing.json?.data?.rows ?? []).find((r) => r.month === MONTH && r.status === "draft");
  if (prev) {
    await api(admin, `/api/payroll/runs/${prev.id}`, null, "DELETE");
    console.log("  (previous draft deleted)");
  }

  // Seed employee ko 3 lates + 5 present seed karo (month ke pehle Mon–Fri working days)
  const { data: bilal } = await sbAdmin.from("hcm_employees").select("id, code, full_name, join_date").eq("code", "EMP-001").maybeSingle();
  const empRow = bilal ?? (await sbAdmin.from("hcm_employees").select("id, code, full_name, join_date").limit(1)).data?.[0];
  check("seed employee found", Boolean(empRow));

  const [yy, mm] = MONTH.split("-");
  const d = (day) => `${yy}-${mm}-${String(day).padStart(2, "0")}`;
  // Working-day seeds (Mon–Fri) — compute loop weekend/holiday records skip
  // karta hai, is liye seeds month ke pehle 8 ACTUAL working days par: 3 late
  // + 5 present. Weekdays dynamically nikaalte hain (month-dependent).
  const lastDay = new Date(Date.UTC(Number(yy), Number(mm), 0)).getUTCDate();
  const workDays = [];
  for (let day = 1; day <= lastDay && workDays.length < 8; day += 1) {
    const dow = new Date(Date.UTC(Number(yy), Number(mm) - 1, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) workDays.push(day);
  }
  const seeded = workDays.map((day, i) => [d(day), i < 3 ? "late" : "present"]);
  await sbAdmin.from("hcm_attendance").delete().eq("employee_id", empRow.id).gte("date", `${MONTH}-01`).lte("date", `${MONTH}-28`);
  const ins = await sbAdmin.from("hcm_attendance").insert(
    seeded.map(([date, status]) => ({ employee_id: empRow.id, date, status, source: "web" }))
  );
  check("May lates seeded", !ins.error, ins.error?.message ?? "");

  const created = await api(admin, "/api/payroll/runs", { month: MONTH });
  check("May draft run created", created.status === 201, `got ${created.status}`);
  runId = created.json?.data?.run?.id;

  const detail = await api(admin, `/api/payroll/runs/${runId}`);
  const items = detail.json?.data?.items ?? [];
  const bilalItem = items.find((it) => it.employee?.code === empRow.code);
  check("run detail has lateDays=3", bilalItem?.lateDays === 3, `got ${bilalItem?.lateDays}`);
  check("latePenaltyDays=0.5", Number(bilalItem?.latePenaltyDays) === 0.5, `got ${bilalItem?.latePenaltyDays}`);

  // Math: deductions == perDay × (absent + unpaid + 0.5×half + 0.5)
  if (bilalItem) {
    const gross = Number(bilalItem.gross);
    const perDay = gross / Number(bilalItem.working_days);
    const expected = Math.round(Math.min(perDay * (Number(bilalItem.absent_days) + Number(bilalItem.unpaid_days) + 0.5 * Number(bilalItem.half_days) + 0.5), gross));
    check(
      "deductions include +0.5 day penalty",
      Math.abs(Number(bilalItem.deductions) - expected) <= 1,
      `got ${bilalItem.deductions}, expected ~${expected}`
    );
  }

  // Payslip PDF (staff can download draft) + HR finalize blocked guard intact
  const pdf = await fetch(`${BASE}/api/payroll/payslips/${bilalItem?.id}/pdf`, { headers: { Cookie: admin } });
  const buf = Buffer.from(await pdf.arrayBuffer());
  check("payslip PDF 200 + %PDF", pdf.status === 200 && buf.slice(0, 4).toString() === "%PDF");
  const hrFinalize = await api(hr, `/api/payroll/runs/${runId}/finalize`, {}, "POST");
  check("HR finalize still 403 (RBAC intact)", hrFinalize.status === 403, `got ${hrFinalize.status} ${JSON.stringify(hrFinalize.json)?.slice(0, 120)}`);

  // cleanup — draft delete + seed clear
  const del = await api(admin, `/api/payroll/runs/${runId}`, null, "DELETE");
  check("draft deleted (cleanup)", del.status === 200);
  await sbAdmin.from("hcm_attendance").delete().eq("employee_id", empRow.id).gte("date", `${MONTH}-01`).lte("date", `${MONTH}-28`);
}

// ===========================================================================
console.log("\n== 4. Attrition risk (admin dashboard) ==");
{
  const r = await api(admin, "/api/dashboard/admin");
  const risk = r.json?.data?.attritionRisk;
  check("attritionRisk block present", Boolean(risk));
  check("companyAbsencePct30d is number ≥ 0", typeof risk?.companyAbsencePct30d === "number" && risk.companyAbsencePct30d >= 0);
  check("top list has score/level/reasons", (risk?.top ?? []).every((t) => typeof t.score === "number" && ["low", "medium", "high"].includes(t.level) && Array.isArray(t.reasons)));
  check("levels consistent with score", (risk?.top ?? []).every((t) => (t.score >= 60 ? t.level === "high" : t.score >= 30 ? t.level === "medium" : t.level === "low")));

  const empDash = await api(emp, "/api/dashboard/admin");
  check("employee still 403 on admin dashboard", empDash.status === 403);
}

// ===========================================================================
console.log("\n== 5. Absence anomaly flags (HR dashboard) ==");
{
  const r = await api(hr, "/api/dashboard/hr");
  check("anomalies array present", Array.isArray(r.json?.data?.anomalies));
  check("anomalySummary present", typeof r.json?.data?.anomalySummary?.companyAbsentPct === "number");
  check(
    "anomaly rows have flags with code+label",
    (r.json?.data?.anomalies ?? []).every((a) => Array.isArray(a.flags) && a.flags.every((f) => f.code && f.label))
  );
  const empDash = await api(emp, "/api/dashboard/hr");
  check("employee still 403 on HR dashboard", empDash.status === 403);
  const meDash = await api(emp, "/api/dashboard/me");
  check("employee me-dashboard still 200 (regression)", meDash.status === 200);
}

// ===========================================================================
console.log("\n== 6. Regression: Jul payroll math unchanged (no lates in Jul) ==");
{
  const runs = await api(admin, "/api/payroll/runs");
  const jul = (runs.json?.data?.rows ?? []).find((r) => r.month === "2026-07" && r.status === "finalized");
  if (!jul) {
    console.log("  (Jul finalized run not present — skip)");
  } else {
    const detail = await api(admin, `/api/payroll/runs/${jul.id}`);
    const items = detail.json?.data?.items ?? [];
    check("Jul items present", items.length > 0);
    check(
      "Jul items: penalty 0 ya lateDays < 3",
      items.every((it) => it.lateDays < 3 && Number(it.latePenaltyDays) === 0)
    );
  }
}

// ===========================================================================
console.log(`\n== RESULT: ${pass} pass, ${fail} fail ==`);
if (failures.length) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
