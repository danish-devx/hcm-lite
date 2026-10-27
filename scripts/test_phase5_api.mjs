/**
 * Phase 5 E2E API verification — leave module (M5).
 * Rules: working-days count, balance check, overlap 409, past 422,
 * holiday exclusion, approve/reject + re-decide 409, cancel (RPC + staff),
 * on-behalf, team calendar RBAC. Service-role cleanup + demo seed at end.
 *
 * Run: node scripts/test_phase5_api.mjs
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

// employee IDs via service role (test targets)
const { data: bilal } = await adminClient
  .from("hcm_employees").select("id, code, full_name").eq("email", "employee.demo@example.com").maybeSingle();
const { data: ayesha } = await adminClient
  .from("hcm_employees").select("id, code, full_name").eq("email", "ayesha.khan@bloom.test").maybeSingle();
console.log(`Targets: Bilal=${bilal?.code} Ayesha=${ayesha?.code}`);

// ---------- 0. Fresh slate ----------
await adminClient.from("hcm_leave_requests").delete().in("employee_id", [bilal.id, ayesha.id]);

console.log("\n== 1. Logins ==");
const emp = await login("employee.demo@example.com", "Test@1234");
check("employee login 200", emp.status === 200, `got ${emp.status}`);
const hr = await login("hr.demo@example.com", "Test@1234");
check("hr login 200", hr.status === 200, `got ${hr.status}`);
const admin = await login("admin.demo@example.com", "Test@1234");
check("admin login 200", admin.status === 200, `got ${admin.status}`);

console.log("\n== 2. GET /api/leave/me (employee) ==");
const meRes = await api(emp.cookie, "GET", "/api/leave/me");
const me = meRes.json?.data;
check("me 200", meRes.status === 200);
check("linked=true", me?.linked === true);
check("today in tz", /^\d{4}-\d{2}-\d{2}$/.test(me?.today ?? ""), me?.today);
check("4 leave types", me?.leaveTypes?.length === 4, `got ${me?.leaveTypes?.length}`);
const annual = me?.leaveTypes?.find((t) => t.code === "annual");
const casual = me?.leaveTypes?.find((t) => t.code === "casual");
const sick = me?.leaveTypes?.find((t) => t.code === "sick");
const unpaid = me?.leaveTypes?.find((t) => t.code === "unpaid");
check("annual quota 14", Number(annual?.yearly_quota) === 14);
check("unpaid quota null", unpaid?.yearly_quota == null);
check("balances: annual remaining 14", me?.balances?.find((b) => b.typeId === annual?.id)?.remaining === 14);
check("balances: unpaid remaining null", me?.balances?.find((b) => b.typeId === unpaid?.id)?.remaining === null);

const meHr = await api(hr.cookie, "GET", "/api/leave/me");
check("hr me linked=false", meHr.json?.data?.linked === false);
check("hr me balances=[]", Array.isArray(meHr.json?.data?.balances) && meHr.json.data.balances.length === 0);

console.log("\n== 3. Apply rules (employee) ==");
const day = (d) => `2026-11-${String(d).padStart(2, "0")}`;
// Nov 2026: Sun 1, Sat 7/14/21/28; Nov 2 Mon – Nov 13 Fri = 10 working days
const r1 = await api(emp.cookie, "POST", "/api/leave", {
  leaveTypeId: annual.id, startDate: day(2), endDate: day(13), reason: "Family wedding events out of city",
});
check("apply annual Nov2-13 → 201", r1.status === 201, JSON.stringify(r1.json));
check("days=10 (weekends excluded)", Number(r1.json?.data?.days) === 10, `days=${r1.json?.data?.days}`);
const annualReqId = r1.json?.data?.id;

const r2 = await api(emp.cookie, "POST", "/api/leave", {
  leaveTypeId: annual.id, startDate: day(4), endDate: day(4), reason: "Overlap probe request",
});
check("overlap pending → 409", r2.status === 409, `${r2.status} ${r2.json?.error}`);

const r3 = await api(emp.cookie, "POST", "/api/leave", {
  leaveTypeId: annual.id, startDate: "2026-10-20", endDate: "2026-10-21", reason: "Past date probe",
});
check("past date → 422", r3.status === 422, `${r3.status}`);

const r4 = await api(emp.cookie, "POST", "/api/leave", {
  leaveTypeId: annual.id, startDate: day(16), endDate: day(13), reason: "End before start probe",
});
check("end<start → 422", r4.status === 422);

const r5 = await api(emp.cookie, "POST", "/api/leave", {
  leaveTypeId: annual.id, startDate: day(7), endDate: day(8), reason: "Weekend only probe",
});
check("weekend-only range → 422 no working days", r5.status === 422, JSON.stringify(r5.json?.error));

const r6 = await api(emp.cookie, "POST", "/api/leave", {
  leaveTypeId: annual.id, startDate: day(16), endDate: day(20), reason: "Balance overflow probe",
});
check("annual 5 more days → 422 (remaining 4)", r6.status === 422, `${r6.status} ${r6.json?.error}`);

// holiday exclusion: Dec 25 = holiday (Fri). Dec 24-25 → 1 working day
const r7 = await api(emp.cookie, "POST", "/api/leave", {
  leaveTypeId: casual.id, startDate: "2026-12-24", endDate: "2026-12-25", reason: "Holiday exclusion probe",
});
check("Dec24-25 days=1 (holiday excluded)", r7.status === 201 && Number(r7.json?.data?.days) === 1, `days=${r7.json?.data?.days}`);

const r8 = await api(emp.cookie, "POST", "/api/leave", {
  leaveTypeId: unpaid.id, startDate: day(16), endDate: day(20), reason: "Unpaid unlimited probe",
});
check("unpaid (quota null) → 201 days=5", r8.status === 201 && Number(r8.json?.data?.days) === 5, `${r8.status}`);
const unpaidReqId = r8.json?.data?.id;

console.log("\n== 4. Balance after usage ==");
const me2 = (await api(emp.cookie, "GET", "/api/leave/me")).json?.data;
const annualBal = me2?.balances?.find((b) => b.typeId === annual.id);
check("annual pending=10, remaining=4", annualBal?.pending === 10 && annualBal?.remaining === 4, JSON.stringify(annualBal));

console.log("\n== 5. Approval flow (staff) ==");
const inbox = await api(hr.cookie, "GET", "/api/leave/requests?status=pending");
check("hr inbox 200", inbox.status === 200);
check("inbox has 3 pending", inbox.json?.data?.rows?.length === 3, `got ${inbox.json?.data?.rows?.length}`);
check("inbox rows carry employee name", (inbox.json?.data?.rows?.[0]?.full_name ?? "") === "Bilal Ahmed");

const empInbox = await api(emp.cookie, "GET", "/api/leave/requests?status=pending");
check("employee inbox → only own", (empInbox.json?.data?.rows ?? []).every((r) => r.employee_id === bilal.id));

const empDecide = await api(emp.cookie, "PATCH", `/api/leave/requests/${annualReqId}`, { action: "approve" });
check("employee decide → 403", empDecide.status === 403, `${empDecide.status}`);

const dec = await api(hr.cookie, "PATCH", `/api/leave/requests/${annualReqId}`, {
  action: "approve", comment: "Approved — cover arranged",
});
check("hr approve → 200 approved", dec.status === 200 && dec.json?.data?.status === "approved", JSON.stringify(dec.json));
const redec = await api(hr.cookie, "PATCH", `/api/leave/requests/${annualReqId}`, { action: "reject" });
check("re-decide → 409", redec.status === 409, `${redec.status}`);

const rej = await api(admin.cookie, "PATCH", `/api/leave/requests/${unpaidReqId}`, {
  action: "reject", comment: "Unpaid leave not viable this sprint",
});
check("admin reject unpaid → 200", rej.status === 200 && rej.json?.data?.status === "rejected");

const me3 = (await api(emp.cookie, "GET", "/api/leave/me")).json?.data;
const annualBal2 = me3?.balances?.find((b) => b.typeId === annual.id);
check("annual approved=10 (remaining 4)", annualBal2?.approved === 10, JSON.stringify(annualBal2));

console.log("\n== 6. Cancel flows ==");
const r9 = await api(emp.cookie, "POST", "/api/leave", {
  leaveTypeId: casual.id, startDate: day(23), endDate: day(24), reason: "Cancel probe request",
});
check("casual apply → 201", r9.status === 201, `${r9.status} ${JSON.stringify(r9.json)}`);
const cancelProbeId = r9.json?.data?.id;

const cancel = await api(emp.cookie, "POST", `/api/leave/requests/${cancelProbeId}/cancel`);
check("employee RPC cancel own pending → 200", cancel.status === 200, `${cancel.status} ${JSON.stringify(cancel.json)}`);
const cancelAgain = await api(emp.cookie, "POST", `/api/leave/requests/${cancelProbeId}/cancel`);
check("cancel again → 409", cancelAgain.status === 409);

const r10 = await api(emp.cookie, "POST", "/api/leave", {
  leaveTypeId: sick.id, startDate: day(26), endDate: day(26), reason: "Staff-cancel probe",
});
check("sick apply → 201", r10.status === 201);
const staffCancel = await api(hr.cookie, "POST", `/api/leave/requests/${r10.json?.data?.id}/cancel`);
check("staff cancel employee pending → 200", staffCancel.status === 200, `${staffCancel.status} ${JSON.stringify(staffCancel.json)}`);

const foreignCancel = await api(emp.cookie, "POST", "/api/leave/requests/00000000-0000-0000-0000-000000000000/cancel");
check("cancel nonexistent → 404", foreignCancel.status === 404, `${foreignCancel.status}`);

console.log("\n== 7. On-behalf (staff) ==");
const behalf = await api(hr.cookie, "POST", "/api/leave", {
  leaveTypeId: sick.id, startDate: day(30), endDate: day(30),
  reason: "Filed by HR — employee reported sick", employeeId: ayesha.id,
});
check("hr on-behalf for Ayesha → 201", behalf.status === 201, `${behalf.status} ${JSON.stringify(behalf.json)}`);
check("on-behalf targets Ayesha", behalf.json?.data?.employee_id === ayesha.id);

const empBehalf = await api(emp.cookie, "POST", "/api/leave", {
  leaveTypeId: casual.id, startDate: day(30), endDate: day(30), reason: "Employee on-behalf probe", employeeId: ayesha.id,
});
check("employee employeeId param ignored (own used)", empBehalf.json?.data?.employee_id === bilal.id, `${empBehalf.status}`);

console.log("\n== 8. Team calendar ==");
const cal = await api(admin.cookie, "GET", "/api/leave/calendar?month=2026-11");
check("admin calendar 200", cal.status === 200);
const calDays = cal.json?.data?.byDay ?? {};
check("calendar has leave days", Object.keys(calDays).length > 0, JSON.stringify(Object.keys(calDays)));
check("Nov 3 (approved annual) present", Object.keys(calDays).includes("2026-11-03"));
check("calendar entry carries name+status", (Object.values(calDays)[0]?.[0]?.name ?? "") === "Bilal Ahmed");

const calEmp = await api(emp.cookie, "GET", "/api/leave/calendar?month=2026-11");
check("employee calendar → 403", calEmp.status === 403, `${calEmp.status}`);

console.log("\n== 9. Security matrix ==");
const anon = await api("", "GET", "/api/leave/me");
check("anon /me → 401", anon.status === 401, `${anon.status}`);
const anonApply = await api("", "POST", "/api/leave", { leaveTypeId: annual.id, startDate: day(2), endDate: day(2), reason: "anon probe" });
check("anon apply → 401", anonApply.status === 401);
const badBody = await api(emp.cookie, "POST", "/api/leave", { leaveTypeId: "not-a-uuid", startDate: "bad", endDate: "bad", reason: "x" });
check("bad body → 422 zod", badBody.status === 422, `${badBody.status}`);

console.log("\n== 10. Cleanup + demo seed ==");
await adminClient.from("hcm_leave_requests").delete().in("employee_id", [bilal.id, ayesha.id]);

// Demo state: rich but clean
const seed = [
  { emp: bilal.id, type: annual.id, start: "2026-11-02", end: "2026-11-13", days: 10, status: "approved", reason: "Family wedding events out of city", comment: "Approved — team cover arranged with Ayesha" },
  { emp: bilal.id, type: sick.id, start: "2026-11-30", end: "2026-11-30", days: 1, status: "pending", reason: "Fever and flu — doctor advised rest" },
  { emp: ayesha.id, type: casual.id, start: "2026-11-03", end: "2026-11-04", days: 2, status: "pending", reason: "House shifting within Karachi" },
  { emp: ayesha.id, type: annual.id, start: "2026-12-21", end: "2026-12-23", days: 3, status: "approved", reason: "Winter break trip planned in advance", comment: "Enjoy — approved" },
];
const { data: seeded, error: seedErr } = await adminClient
  .from("hcm_leave_requests")
  .insert(seed.map((s) => ({
    employee_id: s.emp, leave_type_id: s.type, start_date: s.start, end_date: s.end,
    days: s.days, reason: s.reason, status: s.status,
  })))
  .select("id, status");
check("demo seed 4 rows", !seedErr && seeded?.length === 4, seedErr?.message ?? `got ${seeded?.length}`);

// attach decision metadata to approved seeds
const { data: seededApproved } = await adminClient
  .from("hcm_leave_requests").select("id, status").eq("status", "approved");
console.log(`Approved seeds: ${seededApproved?.length} (decided_by left null — audit-lite demo data)`);

console.log(`\n==== PHASE 5 API: ${pass} pass, ${fail} fail ====`);
process.exit(fail > 0 ? 1 : 0);
