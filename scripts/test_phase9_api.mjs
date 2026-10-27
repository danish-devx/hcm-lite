/**
 * Phase 9 E2E API verification — Comms & Audit (M9).
 * Covers: announcements RBAC + CRUD + fan-out, notifications GET/mark-read
 * scoping, leave decision + on-behalf + correction-decision + payslip-ready
 * notification hooks, audit-log RBAC + filters + pagination + facets.
 *
 * IDEMPOTENT: announcements use QA markers and get deleted; notifications
 * fan-out of deleted posts is cleaned at the end; leave/correction/payroll
 * flows pick collision-free slots (re-runs tolerate 409 and re-verify).
 * Leaves clean demo data: 2 announcements, Bilal Dec14-15 approved casual,
 * Dec-2025 healthy payslip run (outside 2026 YTD windows).
 *
 * Run: node scripts/test_phase9_api.mjs   (dev server localhost:3000 chahiye)
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
    /* ignore */
  }
  return { status: res.status, json };
}

const stamp = () => new Date().toISOString().slice(5, 16).replace("T", " ");

async function main() {
  console.log("== Phase 9 — Comms & Audit (M9) ==\n");

  // ---------- logins ----------
  console.log("[logins]");
  const admin = await login("admin.demo@example.com", "Test@1234");
  const hr = await login("hr.demo@example.com", "Test@1234");
  const emp = await login("employee.demo@example.com", "Test@1234");
  check("admin login", !!admin);
  check("hr login", !!hr);
  check("employee login", !!emp);

  // context: Bilal (employee.demo) employee row + user_id
  const { data: bilal } = await sbAdmin
    .from("hcm_employees")
    .select("id, user_id, full_name")
    .eq("email", "employee.demo@example.com")
    .maybeSingle();
  check("Bilal employee row + user link", !!bilal?.id && !!bilal?.user_id);

  // ---------- auth guards ----------
  console.log("\n[auth guards]");
  check("anon GET announcements 401", (await api(null, "/api/announcements")).status === 401);
  check("anon GET notifications 401", (await api(null, "/api/notifications")).status === 401);
  check("anon GET audit-log 401", (await api(null, "/api/audit-log")).status === 401);
  check("employee POST announcement 403", (await api(emp, "/api/announcements", { title: "nope", body: "nope nope" })).status === 403);
  check("employee GET audit-log 403", (await api(emp, "/api/audit-log")).status === 403);
  check("hr GET audit-log 403", (await api(hr, "/api/audit-log")).status === 403);

  // ---------- announcements ----------
  console.log("\n[announcements]");
  const qa = `QA-${Date.now()}`;
  check("hr POST invalid 422", (await api(hr, "/api/announcements", { title: "no", body: "short" })).status === 422);

  const post1 = await api(hr, "/api/announcements", {
    title: `System maintenance window ${qa}`,
    body: "Tonight 10 PM–12 AM the system will be briefly unavailable (QA post).",
  });
  check("hr POST announcement 201", post1.status === 201, `got ${post1.status}`);
  check("fan-out notified >= 2", (post1.json?.data?.notified ?? 0) >= 2, `notified=${post1.json?.data?.notified}`);

  const adminList = await api(admin, "/api/announcements");
  const hrItemAdminView = (adminList.json?.data ?? []).find((a) => a.title?.includes(qa));
  check("admin GET list contains post", !!hrItemAdminView);
  check("author name resolved", hrItemAdminView?.author?.full_name?.includes("HR") || !!hrItemAdminView?.author?.full_name, JSON.stringify(hrItemAdminView?.author));

  const empList = await api(emp, "/api/announcements");
  const empItem = (empList.json?.data ?? []).find((a) => a.title?.includes(qa));
  check("employee GET sees post", !!empItem);
  check("employee cannot delete", empItem?.canDelete === false);

  const hrList = await api(hr, "/api/announcements");
  const hrItem = (hrList.json?.data ?? []).find((a) => a.title?.includes(qa));
  check("hr own post canDelete", hrItem?.canDelete === true);

  const adminPost = await api(admin, "/api/announcements", {
    title: `Town hall Friday ${qa}`,
    body: "All-hands town hall this Friday at 4 PM in the main hall (QA post).",
  });
  check("admin POST announcement 201", adminPost.status === 201);

  check("employee DELETE 403", (await api(emp, `/api/announcements/${hrItem?.id}`, null, "DELETE")).status === 403);
  check("hr DELETE own 200", (await api(hr, `/api/announcements/${hrItem?.id}`, null, "DELETE")).status === 200);
  check("admin DELETE any 200", (await api(admin, `/api/announcements/${adminPost.json?.data?.id}`, null, "DELETE")).status === 200);
  check("deleted post 404 after", (await api(hr, `/api/announcements/${hrItem?.id}`, null, "DELETE")).status === 404);

  // ---------- notifications ----------
  console.log("\n[notifications]");
  const adminNotifs = await api(admin, "/api/notifications");
  const annNotif = (adminNotifs.json?.data?.items ?? []).find((n) => n.title?.includes(qa));
  check("admin notification received", !!annNotif);
  check("unread count >= 1", (adminNotifs.json?.data?.unread ?? 0) >= 1);

  const empNotifs1 = await api(emp, "/api/notifications");
  const empAnnNotif = (empNotifs1.json?.data?.items ?? []).find((n) => n.title?.includes(qa));
  check("employee notification received", !!empAnnNotif);

  const marked = await api(emp, "/api/notifications", { ids: [empAnnNotif?.id ?? crypto.randomUUID()] });
  check("employee mark-read own", marked.status === 200 && marked.json?.data?.updated === 1, JSON.stringify(marked.json));
  const randomMark = await api(emp, "/api/notifications", { ids: [crypto.randomUUID()] });
  check("mark-read random id → 0", randomMark.json?.data?.updated === 0);
  const markAll = await api(emp, "/api/notifications", { all: true });
  check("employee mark-all read", markAll.status === 200);
  const empNotifs2 = await api(emp, "/api/notifications");
  check("unread now 0", empNotifs2.json?.data?.unread === 0);
  check("mark-read validation 422", (await api(emp, "/api/notifications", {})).status === 422);

  // ---------- leave decision notification hooks ----------
  console.log("\n[leave notification hooks]");
  const meRes = await api(emp, "/api/leave/me");
  const casualType = (meRes.json?.data?.leaveTypes ?? []).find((t) => t.code === "casual");
  check("casual leave type present", !!casualType?.id);

  // next Mon-Tue pair — 409 (overlap) par agli week try karta hai.
  // Pehle check: pichhli run ka approved M9 QA request already hai? → reuse (no new data)
  const existingReqs = await api(hr, "/api/leave/requests", null);
  const preApproved = (existingReqs.json?.data?.rows ?? []).find(
    (r) => r.employee_id === bilal.id && r.status === "approved" && r.reason?.includes("M9 QA")
  );
  async function applyPairFreeSlot() {
    if (preApproved) {
      console.log(`    (existing approved M9 QA request ${preApproved.start_date} → reuse)`);
      return { status: 200, json: { data: preApproved } };
    }
    const today = new Date();
    const iso = (x) => x.toISOString().slice(0, 10);
    for (let week = 1; week <= 8; week += 1) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + week * 7);
      while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
      const start = iso(d);
      const end = iso(new Date(d.getTime() + 86400000));
      if (start < iso(today)) continue;
      const attempt = await api(hr, "/api/leave", {
        leaveTypeId: casualType.id,
        startDate: start,
        endDate: end,
        reason: "Family event out of city — filed by HR on behalf (M9 QA).",
        employeeId: bilal.id,
      });
      if (attempt.status === 201) return attempt;
      if (attempt.status !== 409) return attempt; // non-overlap failure — report
      console.log(`    (slot ${start} overlap → next week)`);
    }
    return { status: 422, json: null };
  }
  const onBehalf = await applyPairFreeSlot();
  check("hr on-behalf apply 201", [201, 200].includes(onBehalf.status) && !!onBehalf.json?.data?.id, `got ${onBehalf.status} ${JSON.stringify(onBehalf.json).slice(0, 140)}`);
  const onBehalfId = onBehalf.json?.data?.id;

  await new Promise((r) => setTimeout(r, 400));
  const empNotifs3 = await api(emp, "/api/notifications");
  check(
    "employee 'filed for you' notification",
    (empNotifs3.json?.data?.items ?? []).some((n) => n.title?.includes("filed for you")),
    JSON.stringify((empNotifs3.json?.data?.items ?? []).slice(0, 2).map((n) => n.title))
  );

  const approve = await api(hr, `/api/leave/requests/${onBehalfId}`, {
    action: "approve",
    comment: "Approved — enjoy the family event.",
  }, "PATCH");
  if (approve.status === 409) {
    check("leave already approved (re-run)", true);
  } else {
    check("hr approve on-behalf 200", approve.status === 200, `got ${approve.status} ${JSON.stringify(approve.json)}`);
  }

  await new Promise((r) => setTimeout(r, 400));
  const empNotifs4 = await api(emp, "/api/notifications");
  check(
    "employee 'Leave approved' notification",
    (empNotifs4.json?.data?.items ?? []).some((n) => n.title?.includes("Leave approved")),
  );

  // ---------- correction decision notification hook ----------
  console.log("\n[correction notification hook]");
  const corr = await api(emp, "/api/attendance/corrections", {
    date: "2026-10-15",
    requestedCheckIn: "09:05",
    requestedCheckOut: "18:05",
    reason: "Forgot to check out — badge records show exit at 6:05 PM (M9 QA).",
  });
  if (corr.status === 409) {
    check("correction dup-pending 409 (re-run)", true);
  } else {
    check("employee correction create 201", corr.status === 201, `got ${corr.status}`);
  }
  const corrId = corr.json?.data?.id;
  if (corrId) {
    const decide = await api(hr, `/api/attendance/corrections/${corrId}`, {
      decision: "reject",
      comment: "Records already show a complete day — no correction needed.",
    }, "PATCH");
    check("hr reject correction 200", decide.status === 200, `got ${decide.status}`);
    await new Promise((r) => setTimeout(r, 400));
    const empNotifs5 = await api(emp, "/api/notifications");
    check(
      "employee correction-decided notification",
      (empNotifs5.json?.data?.items ?? []).some((n) => n.title?.includes("correction rejected") || n.title?.includes("correction approved")),
    );
  }

  // ---------- payslip-ready notification (finalize hook) ----------
  console.log("\n[payslip notification hook — 2025-12 run]");
  // 1) seed Bilal full-present attendance for Dec 2025 weekdays (healthy payslip)
  const decWeekdays = [];
  for (let day = 1; day <= 31; day += 1) {
    const dt = new Date(Date.UTC(2025, 11, day));
    const wd = dt.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      const iso = dt.toISOString().slice(0, 10);
      decWeekdays.push({
        employee_id: bilal.id,
        date: iso,
        check_in: `${iso}T04:00:00+00:00`,
        check_out: `${iso}T13:00:00+00:00`,
        status: "present",
        source: "web",
        worked_minutes: 540,
      });
    }
  }
  const { error: seedErr } = await sbAdmin.from("hcm_attendance").upsert(decWeekdays, { onConflict: "employee_id,date" });
  check("Dec-2025 attendance seeded", !seedErr, seedErr?.message);

  // 2) create run (or locate existing on re-run)
  let runCreate = await api(hr, "/api/payroll/runs", { month: "2025-12" });
  if (runCreate.status === 409) {
    const runs = await api(hr, "/api/payroll/runs");
    const existing = (runs.json?.data?.rows ?? runs.json?.data ?? []).find?.((r) => r.month === "2025-12");
    runCreate = { status: 200, json: { data: existing } };
  }
  check("2025-12 run created", [201, 200].includes(runCreate.status), `got ${runCreate.status} ${JSON.stringify(runCreate.json).slice(0, 160)}`);
  const runId = runCreate.json?.data?.id ?? runCreate.json?.data?.run?.id;

  // 3) detail — only Bilal (join dates), healthy numbers
  const runDetail = await api(hr, `/api/payroll/runs/${runId}`);
  const items = runDetail.json?.data?.items ?? [];
  check("run has 1 item (Bilal only)", items.length === 1 && items[0]?.employee_id === bilal.id, `items=${items.length}`);
  check("gross = 180000 (1.5 × basic)", Number(items[0]?.gross ?? items[0]?.gross_amount ?? 0) === 180000, `gross=${items[0]?.gross}`);
  check("net = 165500 (tax 14500)", Number(items[0]?.net ?? items[0]?.net_amount ?? 0) === 165500, `net=${items[0]?.net}`);

  // 4) finalize as admin (HR 403 already covered in phase 6) → notification
  const finalize = await api(admin, `/api/payroll/runs/${runId}/finalize`, {});
  check("admin finalize 200 (or already 409)", [200, 409].includes(finalize.status), `got ${finalize.status}`);

  await new Promise((r) => setTimeout(r, 500));
  const empNotifs6 = await api(emp, "/api/notifications");
  check(
    "employee 'Payslip ready — December 2025' notification",
    (empNotifs6.json?.data?.items ?? []).some((n) => n.title?.includes("Payslip ready") && n.title?.includes("December 2025")),
    JSON.stringify((empNotifs6.json?.data?.items ?? []).slice(0, 3).map((n) => n.title)),
  );

  // ---------- audit log ----------
  console.log("\n[audit log]");
  const audit = await api(admin, "/api/audit-log");
  check("admin GET 200", audit.status === 200);
  check("total >= 20 entries", (audit.json?.data?.total ?? 0) >= 20, `total=${audit.json?.data?.total}`);
  check("page size <= 25", (audit.json?.data?.items ?? []).length <= 25);
  check("groups facet includes leave/payroll/announcement", ["leave", "payroll", "announcement"].every((g) => (audit.json?.data?.groups ?? []).includes(g)), JSON.stringify(audit.json?.data?.groups));
  check("actor names resolved", (audit.json?.data?.items ?? []).every((r) => !!r.actor?.full_name));
  check("announcement.create in trail", (audit.json?.data?.items ?? []).some((r) => r.action === "announcement.create"));
  const leaveGroup = await api(admin, "/api/audit-log?group=leave");
  check("leave.approved in leave group trail", (leaveGroup.json?.data?.items ?? []).some((r) => r.action === "leave.approved"));
  check("leave group rows all leave.*", (leaveGroup.json?.data?.items ?? []).every((r) => r.action.startsWith("leave.")));

  const byGroup = await api(admin, "/api/audit-log?group=payroll");
  check("group filter all payroll.*", (byGroup.json?.data?.items ?? []).length > 0 && (byGroup.json?.data?.items ?? []).every((r) => r.action.startsWith("payroll.")));
  check("payroll.finalize in group trail", (byGroup.json?.data?.items ?? []).some((r) => r.action === "payroll.finalize"));

  const byQ = await api(admin, "/api/audit-log?q=finalize");
  check("q search finds finalize", (byQ.json?.data?.items ?? []).length >= 1);

  const today = new Date().toISOString().slice(0, 10);
  const byDate = await api(admin, `/api/audit-log?from=${today}&to=${today}`);
  check("date filter (today) has entries", (byDate.json?.data?.total ?? 0) >= 1);
  const dateOk = (byDate.json?.data?.items ?? []).every((r) => r.created_at.slice(0, 10) >= today);
  check("all rows within from/to", dateOk);

  const byDeptGroup = await api(admin, "/api/audit-log?group=department");
  check("underscore group (department_*) filtered", (byDeptGroup.json?.data?.items ?? []).length > 0 && (byDeptGroup.json?.data?.items ?? []).every((r) => r.action.startsWith("department")));
  const page1 = await api(admin, "/api/audit-log?page=1");
  const page2 = await api(admin, "/api/audit-log?page=2");
  const p1first = page1.json?.data?.items?.[0]?.id;
  const p2first = page2.json?.data?.items?.[0]?.id;
  check("pagination page 2 differs", !!p2first && p1first !== p2first);

  // ---------- demo seed: 2 announcements (sirf pehli baar — duplicates skip) ----------
  console.log("\n[demo seed]");
  const curList = await api(admin, "/api/announcements");
  const titles = new Set((curList.json?.data ?? []).map((a) => a.title));
  if (!titles.has("Welcome to Bloom — your HR companion")) {
    const seed1 = await api(admin, "/api/announcements", {
      title: "Welcome to Bloom — your HR companion",
      body: "Assalam-o-Alaikum team! Bloom HR par aap ka daily attendance, leave, payslips aur company updates sab ek jagah milenge. Notifications bell par nazar rakhein.",
    });
    check("demo announcement 1 posted", seed1.status === 201);
  } else {
    check("demo announcement 1 already present (skip)", true);
  }
  if (!titles.has("Health insurance enrolment — deadline 10 November")) {
    const seed2 = await api(hr, "/api/announcements", {
      title: "Health insurance enrolment — deadline 10 November",
      body: "Please confirm your dependents for the 2026 group health plan before 10 November. HR desk se form collect karein ya HR portal par reply karein.",
    });
    check("demo announcement 2 posted", seed2.status === 201);
  } else {
    check("demo announcement 2 already present (skip)", true);
  }

  // ---------- cleanup: QA notification noise ----------
  await sbAdmin.from("hcm_notifications").delete().ilike("title", "%QA-%");
  console.log("\n(cleaned QA-marker notifications)");

  // ---------- summary ----------
  console.log(`\n===== RESULT: ${pass} PASS / ${fail} FAIL =====`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
