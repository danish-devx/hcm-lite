import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { apiHandler, ApiError, requireAuth } from "@/lib/guards";
import { writeAudit } from "@/lib/services/audit.service";
import { latePenaltyDaysOf, monthBounds, monthTitle, money, taxSlabFor, workingDayLateCount } from "@/lib/services/payroll.service";

/**
 * GET /api/payroll/payslips/[itemId]/pdf — payslip download.
 * Access:
 *  - staff (admin/hr): kisi bhi payslip ka PDF (draft review included)
 *  - employee: SIRF apna, aur SIRF finalized runs se (draft invisible)
 */
export const GET = apiHandler(async (request, context) => {
  const { itemId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(itemId ?? "")) {
    throw new ApiError(404, "Payslip not found.");
  }
  const { supabase, profile } = await requireAuth();
  const isStaff = profile.role === "admin" || profile.role === "hr";

  const { data: item, error } = await supabase
    .from("hcm_payroll_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!item) throw new ApiError(404, "Payslip not found.");

  const { data: run } = await supabase
    .from("hcm_payroll_runs")
    .select("id, month, status, finalized_at, finalized_by")
    .eq("id", item.run_id)
    .maybeSingle();
  if (!run) throw new ApiError(404, "Payroll run not found.");

  if (!isStaff) {
    if (!profile.employee_id || profile.employee_id !== item.employee_id) {
      throw new ApiError(403, "You can only download your own payslip.");
    }
    if (run.status !== "finalized") {
      throw new ApiError(403, "Payslip will be available once the run is finalized.");
    }
  }

  const { data: employee } = await supabase
    .from("hcm_employees")
    .select("id, code, full_name, join_date, department_id, designation_id")
    .eq("id", item.employee_id)
    .maybeSingle();

  let department = null;
  let designation = null;
  if (employee?.department_id) {
    const { data: d } = await supabase
      .from("hcm_departments")
      .select("name")
      .eq("id", employee.department_id)
      .maybeSingle();
    department = d?.name ?? null;
  }
  if (employee?.designation_id) {
    const { data: d } = await supabase
      .from("hcm_designations")
      .select("name")
      .eq("id", employee.designation_id)
      .maybeSingle();
    designation = d?.name ?? null;
  }

  let finalizedByName = null;
  if (run.finalized_by) {
    const { data: p } = await supabase
      .from("hcm_profiles")
      .select("full_name")
      .eq("id", run.finalized_by)
      .maybeSingle();
    finalizedByName = p?.full_name ?? null;
  }

  // Late count for the month (bonus rule "3 lates = 0.5 day") — display only;
  // stored deductions me penalty compute-time par already folded hai. Working
  // days par hi count (weekend/holiday lates compute me bhi skip hote hain).
  const bounds = monthBounds(run.month);
  const [settingsRes, holRes, lateRes] = await Promise.all([
    supabase.from("hcm_company_settings").select("company_name, weekend_days").eq("id", 1).maybeSingle(),
    supabase.from("hcm_holidays").select("date").gte("date", bounds.start).lte("date", bounds.end),
    supabase
      .from("hcm_attendance")
      .select("date, status")
      .eq("employee_id", item.employee_id)
      .eq("status", "late")
      .gte("date", bounds.start)
      .lte("date", bounds.end),
  ]);
  if (settingsRes.error || holRes.error || lateRes.error) {
    throw new ApiError(500, (settingsRes.error || holRes.error || lateRes.error).message);
  }
  const lateCount = workingDayLateCount(lateRes.data ?? [], {
    weekendDays: settingsRes.data?.weekend_days ?? [0, 6],
    holidaySet: new Set((holRes.data ?? []).map((h) => h.date)),
  });

  writeAudit({
    actorId: profile.id,
    actorRole: profile.role,
    action: "payroll.payslip_download",
    entity: "hcm_payroll_items",
    entityId: item.id,
    after: { employee: employee?.code, month: run.month },
  });

  const pdfBytes = await buildPayslipPdf({
    item,
    run,
    employee: employee
      ? { ...employee, department, designation }
      : { code: "—", full_name: "Unknown" },
    companyName: settingsRes.data?.company_name ?? "Company",
    finalizedByName,
    lateCount: lateCount ?? 0,
  });

  const safeCode = (employee?.code ?? "payslip").replace(/[^a-zA-Z0-9-]+/g, "");
  const filename = `Payslip-${run.month}-${safeCode}.pdf`;

  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

// ---------------------------------------------------------------------------
// pdf-lib payslip renderer — A4 portrait, Helvetica, editorial layout
// ---------------------------------------------------------------------------

const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.45, 0.45, 0.5);
const LINE = rgb(0.85, 0.85, 0.88);
const PLUM = rgb(0.42, 0.24, 0.46);
const WASH = rgb(0.965, 0.955, 0.975);

function fmt(n) {
  return Math.round(Number(n ?? 0)).toLocaleString("en-US");
}

async function buildPayslipPdf({ item, run, employee, companyName, finalizedByName, lateCount = 0 }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 52;
  const RIGHT = 595.28 - M;
  let y = 792;

  const draw = (str, x, yy, size = 10, f = font, color = INK) =>
    page.drawText(String(str), { x, y: yy, size, font: f, color });
  const drawRight = (str, rightX, yy, size = 10, f = font, color = INK) =>
    page.drawText(String(str), {
      x: rightX - f.widthOfTextAtSize(String(str), size),
      y: yy,
      size,
      font: f,
      color,
    });
  const hline = (yy, thickness = 1, color = LINE) =>
    page.drawLine({ start: { x: M, y: yy }, end: { x: RIGHT, y: yy }, thickness, color });

  // ---- Header ----
  draw(companyName.toUpperCase(), M, y, 15, bold, PLUM);
  drawRight("PAYSLIP", RIGHT, y, 11, bold, MUTED);
  y -= 16;
  draw(monthTitle(run.month), M, y, 11, font, MUTED);
  y -= 8;
  hline(y);

  // ---- Employee info grid (2 columns × 3 rows) ----
  y -= 26;
  const info = [
    ["Employee", employee.full_name],
    ["Employee code", employee.code],
    ["Department", employee.department ?? "—"],
    ["Designation", employee.designation ?? "—"],
    ["Join date", employee.join_date ?? "—"],
    ["Pay period", monthTitle(run.month)],
  ];
  let rowY = y;
  for (let i = 0; i < info.length; i += 1) {
    const colIdx = i % 2;
    const x = M + colIdx * 250;
    if (colIdx === 0 && i > 0) rowY -= 30;
    draw(info[i][0].toUpperCase(), x, rowY, 7, font, MUTED);
    draw(info[i][1], x, rowY - 13, 10.5, bold);
  }
  y = rowY - 32;
  hline(y, 0.75);

  // ---- Days summary strip ----
  y -= 26;
  const days = [
    ["Working days", item.working_days],
    ["Payable days", Number(item.payable_days)],
    ["Absent", item.absent_days],
    ["Unpaid", item.unpaid_days],
    ["Half days", item.half_days],
  ];
  let dx = M;
  for (const [label, value] of days) {
    draw(label.toUpperCase(), dx, y, 7, font, MUTED);
    draw(String(value), dx, y - 15, 13, bold);
    dx += 100;
  }

  // ---- Earnings | Deductions ----
  y -= 40;
  const basic = Number(item.basic ?? 0);
  const hra = Math.round(basic * 0.4);
  const medical = Math.round(basic * 0.1);
  const gross = Number(item.gross ?? basic * 1.5);
  const workingDays = Number(item.working_days ?? 0);
  const perDay = workingDays > 0 ? gross / workingDays : 0;
  const absentAmt = Math.round(perDay * Number(item.absent_days ?? 0));
  const unpaidAmt = Math.round(perDay * Number(item.unpaid_days ?? 0));
  const halfAmt = Math.round(perDay * Number(item.half_days ?? 0) * 0.5);

  const column = (title, x, rows, totalLabel, totalValue, startY) => {
    draw(title.toUpperCase(), x, startY, 8, bold, PLUM);
    let ty = startY - 19;
    for (const [label, value] of rows) {
      draw(label, x, ty, 9.5, font, INK);
      drawRight(fmt(value), x + 150, ty, 9.5, font, INK);
      ty -= 15.5;
    }
    ty -= 2;
    draw(totalLabel, x, ty, 10, bold, INK);
    drawRight(fmt(totalValue), x + 150, ty, 10, bold, INK);
    return ty - 20;
  };

  const leftEnd = column(
    "Earnings",
    M,
    [
      ["Basic salary", basic],
      ["House rent allowance (40%)", hra],
      ["Medical allowance (10%)", medical],
    ],
    "Gross salary",
    gross,
    y
  );
  const halfDays = Number(item.half_days ?? 0);
  const penaltyDays = latePenaltyDaysOf(lateCount);
  const penaltyAmt = Math.round(perDay * penaltyDays);
  const deductionRows = [
    [`Absent (${item.absent_days} day${Number(item.absent_days) === 1 ? "" : "s"})`, absentAmt],
    [`Unpaid leave (${item.unpaid_days} day${Number(item.unpaid_days) === 1 ? "" : "s"})`, unpaidAmt],
    [`Half days (${halfDays} × 0.5)`, halfAmt],
  ];
  if (penaltyDays > 0) {
    deductionRows.push([
      `Late penalty (${lateCount} lates = ${penaltyDays} day)`,
      penaltyAmt,
    ]);
  }
  const rightEnd = column(
    "Deductions",
    M + 250,
    deductionRows,
    "Income tax (monthly)",
    Number(item.tax ?? 0),
    y
  );
  y = Math.min(leftEnd, rightEnd);
  hline(y, 0.75);

  // ---- Net pay band ----
  y -= 18;
  page.drawRectangle({ x: M, y: y - 16, width: RIGHT - M, height: 46, color: WASH });
  draw("NET PAY", M + 16, y + 4, 9, bold, PLUM);
  draw(money(item.net), M + 16, y - 10, 13, bold, INK);
  const slab = taxSlabFor(gross);
  const slabLine = `Tax slab ${slab.slabLabel} (${Math.round(slab.rate * 100)}%) on gross × 12`;
  drawRight(slabLine, RIGHT - 16, y + 4, 8, font, MUTED);
  const calcLine = `Gross ${fmt(gross)} - deductions ${fmt(item.deductions)} - tax ${fmt(item.tax)}`;
  drawRight(calcLine, RIGHT - 16, y - 10, 8, font, MUTED);

  // ---- Footer ----
  y -= 52;
  draw(
    "Computer-generated payslip — HCM Lite. Illustrative tax slabs per challenge brief.",
    M,
    y,
    8,
    font,
    MUTED
  );
  y -= 12;
  draw(
    run.status === "finalized"
      ? `Finalized${finalizedByName ? ` by ${finalizedByName}` : ""}${
          run.finalized_at ? ` · ${run.finalized_at.slice(0, 10)}` : ""
        }`
      : `Draft — not finalized yet · generated ${new Date().toISOString().slice(0, 10)}`,
    M,
    y,
    8,
    font,
    MUTED
  );

  return doc.save();
}
