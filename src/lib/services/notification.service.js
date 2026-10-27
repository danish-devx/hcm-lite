import { createAdminClient } from "@/lib/supabase/admin";

/**
 * In-app notifications — brief F24 (M9):
 *  - Leave decisions (approved/rejected) → employee ko
 *  - Payslip ready (payroll finalize) → run ke sab employees ko
 *  - Announcement posted → sab active users ko (fan-out)
 *  - Correction decided → employee ko
 *
 * Notifications HAMESHA service-role (admin client) se jati hain —
 * RLS "notif_insert_staff_or_system" ka system path yehi hai.
 *
 * Fail-safe hai (audit.service jaisa): notification fail hona main
 * business operation ko kabhi fail nahi karega — sirf console log.
 */

function clampText(value, max) {
  if (value == null) return null;
  const str = String(value).trim();
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export async function notifyUser({ userId, title, body = null, link = null }) {
  if (!userId) return false;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("hcm_notifications").insert({
      user_id: userId,
      title: clampText(title, 140),
      body: clampText(body, 400),
      link: clampText(link, 300),
    });
    if (error) console.error("[NOTIFY] insert failed:", error.message);
    return !error;
  } catch (err) {
    console.error("[NOTIFY] unexpected failure:", err?.message);
    return false;
  }
}

/**
 * Fan-out — users: [{ user_id }] ya uuid[] (null/duplicate tolerate karta hai).
 * Ek batch insert (chunks of 100) — announcement fan-out jaise bulk paths ke liye.
 * Returns: delivered count (best-effort).
 */
export async function notifyMany(users, { title, body = null, link = null }) {
  const ids = [
    ...new Set(
      (users ?? [])
        .map((u) => (typeof u === "string" ? u : u?.user_id))
        .filter(Boolean)
    ),
  ];
  if (ids.length === 0) return 0;

  const rows = ids.map((user_id) => ({
    user_id,
    title: clampText(title, 140),
    body: clampText(body, 400),
    link: clampText(link, 300),
  }));

  let delivered = 0;
  try {
    const admin = createAdminClient();
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await admin
        .from("hcm_notifications")
        .insert(rows.slice(i, i + 100));
      if (error) {
        console.error("[NOTIFY] batch insert failed:", error.message);
      } else {
        delivered += rows.slice(i, i + 100).length;
      }
    }
  } catch (err) {
    console.error("[NOTIFY] unexpected failure:", err?.message);
  }
  return delivered;
}
