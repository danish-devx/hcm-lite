/**
 * Attendance service (Phase 4 — M4) — business rules yahan hain, routes thin rehte hain.
 *
 * Brief rules:
 *  - Server stamps the time (RPC hcm_check_in / hcm_check_out — tamper-proof)
 *  - One record per employee per day (second check-in = 409)
 *  - Late after office_start + grace; half_day under half_day_hours; absent if no
 *    record and no approved leave; missing_checkout if no check-out
 *  - Geofence: server Haversine distance check (phone/browser sirf data bhejta hai)
 */

/** Great-circle distance in meters (Haversine). */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Geofence verdict — null coords (location optional on web) => allowed without distance. */
export function geofenceCheck(settings, lat, lng) {
  if (lat == null || lng == null) {
    return { enforced: false, within: true, distanceM: null };
  }
  if (settings.office_lat == null || settings.office_lng == null) {
    // office location configured hi nahi — enforce nahi kar sakte
    return { enforced: false, within: true, distanceM: null };
  }
  const distanceM = haversineMeters(
    Number(lat),
    Number(lng),
    Number(settings.office_lat),
    Number(settings.office_lng)
  );
  const radius = Number(settings.radius_m ?? 150);
  return { enforced: true, within: distanceM <= radius, distanceM, radiusM: radius };
}

// ---------------------------------------------------------------------------
// Company-timezone helpers (Asia/Karachi — no DST, par formula general hai)
// ---------------------------------------------------------------------------

/** Wall-clock parts of an instant inside tz → { y,m,d,h,mi,s }. */
export function wallParts(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  if (map.hour === 24) map.hour = 0;
  return map;
}

/** Offset (ms) of tz at a given instant: wall-clock-as-UTC minus real UTC. */
function tzOffsetMs(date, tz) {
  const p = wallParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/**
 * "2026-10-27" + "09:30" (wall clock in tz) → UTC ISO string.
 * Two-pass offset resolution (DST-safe).
 */
export function wallToUtcIso(dateStr, timeStr, tz) {
  const base = `${dateStr}T${(timeStr ?? "00:00").slice(0, 5)}:00Z`;
  let utc = new Date(base).getTime();
  for (let i = 0; i < 2; i += 1) {
    const off = tzOffsetMs(new Date(utc), tz);
    utc = new Date(base).getTime() - off;
  }
  return new Date(utc).toISOString();
}

/** Today's date (YYYY-MM-DD) in company tz — wahi date jo RPC use karta hai. */
export function todayInTz(tz) {
  const p = wallParts(new Date(), tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function addDaysStr(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 0=Sunday … 6=Saturday (UTC-safe since dateStr is a plain calendar date). */
export function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

// ---------------------------------------------------------------------------
// Effective status matrix — board, calendar aur dashboards sab isi se banenge
// ---------------------------------------------------------------------------

/**
 * Ek (employee, date) ka effective status.
 * record    — hcm_attendance row ya null
 * leave     — approved leave covering date, ya null
 * flags     — { isWeekend, isHoliday }
 * relation  — "past" | "today" | "future" (company tz ke hisaab se)
 */
export function effectiveStatus({ record, leave, isWeekend, isHoliday, relation }) {
  if (record) {
    if (!record.check_out) {
      if (relation === "past") return "missing_checkout";
      if (relation === "today") return record.status ?? "present"; // abhi kaam chal raha
    }
    return record.status ?? "present";
  }
  if (leave) return "on_leave";
  if (isHoliday) return "holiday";
  if (isWeekend) return "weekend";
  if (relation === "past") return "absent";
  if (relation === "today") return "not_checked_in";
  return "upcoming";
}

export const STATUS_META = {
  present: { label: "On time", tone: "success" },
  late: { label: "Late", tone: "warning" },
  half_day: { label: "Half day", tone: "info" },
  missing_checkout: { label: "Missing checkout", tone: "warning" },
  absent: { label: "Absent", tone: "destructive" },
  on_leave: { label: "On leave", tone: "info" },
  weekend: { label: "Weekend", tone: "muted" },
  holiday: { label: "Holiday", tone: "muted" },
  not_checked_in: { label: "Not checked in", tone: "muted" },
  upcoming: { label: "—", tone: "muted" },
};

/** "07:42:03" → "7h 42m" style. */
export function fmtWorked(minutes) {
  const m = Number(minutes ?? 0);
  if (!m) return "—";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h ? `${h}h ${rem ? `${rem}m` : ""}`.trim() : `${rem}m`;
}

// ---------------------------------------------------------------------------
// Correction approve → attendance apply (privileged, admin client se)
// ---------------------------------------------------------------------------

/**
 * Approved correction ko hcm_attendance par apply karo:
 *  - record hai to requested times patch (null = untouched)
 *  - record nahi to insert (e.g. "check-in karna bhool gaya")
 *  - status dobara compute: late / half_day / present (RPC ke rules se match)
 * Returns the upserted row.
 */
export async function applyCorrectionToAttendance({ admin, settings, employeeId, dateStr, checkInIso, checkOutIso }) {
  const tz = settings.timezone ?? "Asia/Karachi";
  const officeStart = String(settings.office_start ?? "09:00").slice(0, 5);
  const grace = Number(settings.grace_minutes ?? 0);

  // Late rule — check_in wall-clock (company tz) vs office_start + grace
  const deriveStatus = (inIso, outIso) => {
    if (!inIso) return "present";
    const inWall = wallParts(new Date(inIso), tz);
    const inMins = inWall.hour * 60 + inWall.minute;
    const [oh, om] = officeStart.split(":").map(Number);
    let status = inMins > oh * 60 + om + grace ? "late" : "present";
    if (outIso) {
      const worked = Math.max(0, Math.round((new Date(outIso) - new Date(inIso)) / 60000));
      if (worked < Number(settings.half_day_hours ?? 5) * 60) status = "half_day";
    }
    return status;
  };

  const { data: existing } = await admin
    .from("hcm_attendance")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("date", dateStr)
    .maybeSingle();

  const nextIn = checkInIso ?? existing?.check_in ?? null;
  const nextOut = checkOutIso ?? existing?.check_out ?? null;
  const worked =
    nextIn && nextOut ? Math.max(0, Math.round((new Date(nextOut) - new Date(nextIn)) / 60000)) : existing?.worked_minutes ?? null;
  const status = deriveStatus(nextIn, nextOut);

  const payload = {
    employee_id: employeeId,
    date: dateStr,
    check_in: nextIn,
    check_out: nextOut,
    status,
    worked_minutes: worked,
  };

  if (existing) {
    const { data, error } = await admin
      .from("hcm_attendance")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await admin
    .from("hcm_attendance")
    .insert({ ...payload, source: "correction" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
