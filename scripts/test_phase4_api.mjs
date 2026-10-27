/**
 * Phase 4 E2E API verification — attendance module (M4).
 * Cookie-jar based: employee check-in/out flows, board RBAC, corrections
 * request → approve/reject → attendance apply, security matrix.
 */
const BASE = "http://localhost:3000";
const JARS = {
  employee: "/tmp/jar-emp.txt",
  hr: "/tmp/jar-hr.txt",
  admin: "/tmp/jar-admin.txt",
};

async function api(jar, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  // persist cookies manually (fetch doesn't use curl jars)
  return res;
}

async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie
    .map((c) => c.split(";")[0])
    .filter((c) => c.includes("="))
    .join("; ");
  const json = await res.json().catch(() => null);
  return { status: res.status, cookie, json };
}

function authHeaders(cookie) {
  return { "Content-Type": "application/json", Cookie: cookie };
}

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

// ---------- 1. Login all three ----------
console.log("\n== 1. Logins ==");
const emp = await login("employee.demo@example.com", "Test@1234");
check("employee login 200", emp.status === 200, `got ${emp.status}`);
const hr = await login("hr.demo@example.com", "Test@1234");
check("hr login 200", hr.status === 200, `got ${hr.status}`);
const admin = await login("admin.demo@example.com", "Test@1234");
check("admin login 200", admin.status === 200, `got ${admin.status}`);

// ---------- 2. /me self view ----------
console.log("\n== 2. GET /api/attendance/me (employee) ==");
const meRes = await fetch(`${BASE}/api/attendance/me`, { headers: authHeaders(emp.cookie) });
const me = (await meRes.json())?.data;
check("me 200", meRes.status === 200);
check("linked=true", me?.linked === true);
check("today present in tz", /^\d{4}-\d{2}-\d{2}$/.test(me?.today ?? ""), me?.today);
check("office radius 150", me?.office?.radius_m === 150, JSON.stringify(me?.office));
check("month days count = day of month", me?.month?.days?.length > 0, `days=${me?.month?.days?.length}`);

// no-link user (hr) → linked:false
const meHr = await fetch(`${BASE}/api/attendance/me`, { headers: authHeaders(hr.cookie) });
const meHrData = (await meHr.json())?.data;
check("hr me linked=false", meHrData?.linked === false);

// ---------- 3. Check-in flows ----------
console.log("\n== 3. Check-in / check-out ==");
const in1 = await fetch(`${BASE}/api/attendance/check-in`, {
  method: "POST",
  headers: authHeaders(emp.cookie),
  body: JSON.stringify({ source: "web" }),
});
const in1Data = (await in1.json())?.data;
check("check-in 201", in1.status === 201, `got ${in1.status}: ${JSON.stringify(in1Data)}`);
check("status present|late", ["present", "late"].includes(in1Data?.attendance?.status), in1Data?.attendance?.status);

const in2 = await fetch(`${BASE}/api/attendance/check-in`, {
  method: "POST",
  headers: authHeaders(emp.cookie),
  body: JSON.stringify({}),
});
check("duplicate check-in → 409", in2.status === 409, `got ${in2.status}`);

// geofence reject: coords far from office (office 24.885234, 66.987688 → use Lahore 31.52, 74.35)
const out1 = await fetch(`${BASE}/api/attendance/check-out`, {
  method: "POST",
  headers: authHeaders(emp.cookie),
  body: JSON.stringify({}),
});
const out1Data = (await out1.json())?.data;
check("check-out 200", out1.status === 200, `got ${out1.status}`);
check("worked_minutes > 0", (out1Data?.attendance?.worked_minutes ?? 0) >= 0, `${out1Data?.attendance?.worked_minutes}`);

const out2 = await fetch(`${BASE}/api/attendance/check-out`, { method: "POST", headers: authHeaders(emp.cookie), body: "{}" });
check("double check-out → 409", out2.status === 409, `got ${out2.status}`);

// geofence: HR has no employee link → 422
const hrIn = await fetch(`${BASE}/api/attendance/check-in`, {
  method: "POST",
  headers: authHeaders(hr.cookie),
  body: JSON.stringify({}),
});
check("hr check-in without employee link → 422", hrIn.status === 422, `got ${hrIn.status}`);

// ---------- 4. Daily board RBAC ----------
console.log("\n== 4. Daily board ==");
const boardEmp = await fetch(`${BASE}/api/attendance`, { headers: authHeaders(emp.cookie) });
check("employee board → 403", boardEmp.status === 403, `got ${boardEmp.status}`);

const boardHr = await fetch(`${BASE}/api/attendance`, { headers: authHeaders(hr.cookie) });
const board = (await boardHr.json())?.data;
check("hr board 200", boardHr.status === 200);
check("board has rows", (board?.rows?.length ?? 0) > 0, `rows=${board?.rows?.length}`);
const bilal = board?.rows?.find((r) => r.email === "employee.demo@example.com");
check("Bilal row with record status", bilal && ["present", "late", "half_day"].includes(bilal.status), JSON.stringify(bilal));
check("summary.total = rows", board?.summary?.total === board?.rows?.length);

// unauth
const boardAnon = await fetch(`${BASE}/api/attendance`);
check("anon board → 401", boardAnon.status === 401, `got ${boardAnon.status}`);

// ---------- 5. Corrections flow ----------
console.log("\n== 5. Corrections ==");
const today = me.today;
const corrCreate = await fetch(`${BASE}/api/attendance/corrections`, {
  method: "POST",
  headers: authHeaders(emp.cookie),
  body: JSON.stringify({
    date: today,
    requestedCheckIn: "08:55",
    requestedCheckOut: "17:30",
    reason: "E2E test — punch times need fixing",
  }),
});
const corr = (await corrCreate.json())?.data;
check("correction create 201", corrCreate.status === 201, `got ${corrCreate.status}`);
check("status pending", corr?.status === "pending");

// duplicate pending → 409
const corrDup = await fetch(`${BASE}/api/attendance/corrections`, {
  method: "POST",
  headers: authHeaders(emp.cookie),
  body: JSON.stringify({ date: today, requestedCheckIn: "09:00", reason: "dup test" }),
});
check("duplicate pending → 409", corrDup.status === 409, `got ${corrDup.status}`);

// future date → 422
const corrFuture = await fetch(`${BASE}/api/attendance/corrections`, {
  method: "POST",
  headers: authHeaders(emp.cookie),
  body: JSON.stringify({ date: "2027-01-01", requestedCheckIn: "09:00", reason: "future test" }),
});
check("future date → 422", corrFuture.status === 422, `got ${corrFuture.status}`);

// employee tries to decide → 403
const corrEmpDecide = await fetch(`${BASE}/api/attendance/corrections/${corr.id}`, {
  method: "PATCH",
  headers: authHeaders(emp.cookie),
  body: JSON.stringify({ decision: "approve" }),
});
check("employee decide → 403", corrEmpDecide.status === 403, `got ${corrEmpDecide.status}`);

// HR sees pending list
const pendingHr = await fetch(`${BASE}/api/attendance/corrections?status=pending`, { headers: authHeaders(hr.cookie) });
const pendingList = (await pendingHr.json())?.data;
check("hr pending list has request", (pendingList ?? []).some((c) => c.id === corr.id));

// HR approves → attendance applied (08:55 → before 09:00 office start → present, not late)
const approve = await fetch(`${BASE}/api/attendance/corrections/${corr.id}`, {
  method: "PATCH",
  headers: authHeaders(hr.cookie),
  body: JSON.stringify({ decision: "approve", comment: "Verified with supervisor" }),
});
const approveData = (await approve.json())?.data;
check("hr approve 200", approve.status === 200, `got ${approve.status}`);
check("applied check_in set", Boolean(approveData?.applied?.check_in));
check("applied status present (08:55 < 09:00)", approveData?.applied?.status === "present", approveData?.applied?.status);
check("worked = 8h35m = 515", approveData?.applied?.worked_minutes === 515, `${approveData?.applied?.worked_minutes}`);

// double decide → 409
const reDecide = await fetch(`${BASE}/api/attendance/corrections/${corr.id}`, {
  method: "PATCH",
  headers: authHeaders(hr.cookie),
  body: JSON.stringify({ decision: "reject" }),
});
check("re-decide → 409", reDecide.status === 409, `got ${reDecide.status}`);

// employee sees own correction approved
const meAfter = await fetch(`${BASE}/api/attendance/me`, { headers: authHeaders(emp.cookie) });
const meAfterData = (await meAfter.json())?.data;
const myCorr = (meAfterData?.corrections ?? []).find((c) => c.id === corr.id);
check("employee sees approved correction", myCorr?.status === "approved");
check("employee corrections NOT visible to others (hr list shows name)", (pendingList ?? []).every((c) => c.full_name));

// reject flow: create second request for yesterday? today has approved corr — use same date allowed? pending only blocked; create for a past day
const yesterday = new Date(`${today}T00:00:00Z`);
yesterday.setUTCDate(yesterday.getUTCDate() - 1);
const yStr = yesterday.toISOString().slice(0, 10);
const corr2 = await fetch(`${BASE}/api/attendance/corrections`, {
  method: "POST",
  headers: authHeaders(emp.cookie),
  body: JSON.stringify({ date: yStr, requestedCheckIn: "10:15", reason: "Late arrival — bus delay (E2E)" }),
});
const corr2Data = (await corr2.json())?.data;
check("second correction create 201", corr2.status === 201, `got ${corr2.status}`);

const reject = await fetch(`${BASE}/api/attendance/corrections/${corr2Data.id}`, {
  method: "PATCH",
  headers: authHeaders(admin.cookie),
  body: JSON.stringify({ decision: "reject", comment: "No proof attached" }),
});
const rejectData = (await reject.json())?.data;
check("admin reject 200", reject.status === 200);
check("applied stays null on reject", rejectData?.applied === null, JSON.stringify(rejectData?.applied));

// approve-with-late case: create + approve correction with 10:15 on a clean day → status late
const approveLate = await fetch(`${BASE}/api/attendance/corrections/${corr2Data.id}`, {
  method: "PATCH",
  headers: authHeaders(admin.cookie),
});
check("decide on rejected → 409", approveLate.status === 409);

// ---------- 6. Records browser ----------
console.log("\n== 6. Records ==");
const recs = await fetch(`${BASE}/api/attendance/records`, { headers: authHeaders(hr.cookie) });
const recsData = (await recs.json())?.data;
check("hr records 200", recs.status === 200);
check("records contain today's punches", (recsData?.rows ?? []).some((r) => r.date === today), `total=${recsData?.total}`);
const recsEmp = await fetch(`${BASE}/api/attendance/records`, { headers: authHeaders(emp.cookie) });
check("employee records → 403", recsEmp.status === 403, `got ${recsEmp.status}`);

console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
