"use client";

import * as React from "react";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { MyPayslips } from "@/components/modules/payroll/my-payslips";
import { RunDetail } from "@/components/modules/payroll/run-detail";
import { RunsList } from "@/components/modules/payroll/runs-list";
import { useGetMyPayslipsQuery, useGetPayrollRunsQuery } from "@/store/api/payrollApi";
import { money, monthTitle } from "./payroll-bits";

/**
 * /payroll — role-aware (M6):
 *  - admin/hr: runs list → run detail (draft review, finalize admin-only)
 *  - employee: My payslips (finalized only, PDF download)
 *  - linked staff ko neeche apne payslips bhi dikhte hain
 */

function currentMonthFallback() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function PayrollClient({ role }) {
  const isStaff = role === "admin" || role === "hr";
  const [selectedRunId, setSelectedRunId] = React.useState(null);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        index="06"
        eyebrow={`Payroll · ${isStaff ? "Runs" : "Self-service"}`}
        title={isStaff ? "Payroll" : "My payslips"}
        description={
          isStaff
            ? "Monthly run — gross = 1.5 × basic (HRA 40% + medical 10%), deductions attendance aur unpaid leave se, tax slab gross × 12 par. HR draft banata hai, sirf Admin finalize lock karta hai."
            : "Aap ke finalized payslips — har month ka gross, deductions, tax aur net pay, PDF download ke saath."
        }
      />
      {isStaff ? (
        <StaffPayrollBody
          selectedRunId={selectedRunId}
          onSelectRun={setSelectedRunId}
          role={role}
        />
      ) : (
        <MyPayslips />
      )}
    </div>
  );
}

function StaffPayrollBody({ selectedRunId, onSelectRun, role }) {
  const { data, isFetching } = useGetPayrollRunsQuery();

  // Stale-selection guard: selected run list se gayab (deleted) → clear.
  // isFetching use karte hain — invalidation-refetch ke dauran data stale
  // hota hai (isLoading false rehta hai) aur guard detail ko band kar deta tha.
  React.useEffect(() => {
    if (isFetching || !selectedRunId) return;
    const rows = data?.rows ?? [];
    if (rows.length > 0 && !rows.some((r) => r.id === selectedRunId)) onSelectRun(null);
  }, [data, isFetching, selectedRunId, onSelectRun]);

  if (selectedRunId) {
    return <RunDetail runId={selectedRunId} onBack={() => onSelectRun(null)} role={role} />;
  }

  return (
    <div className="space-y-8">
      <RunsList
        runs={data?.rows ?? []}
        isLoading={isFetching && !data}
        onOpen={(id) => onSelectRun(id)}
        currentMonth={currentMonthFallback()}
      />
      <LinkedStaffPayslips />
    </div>
  );
}

/** Linked staff (HR/Admin with employee record) — apne payslips bhi. */
function LinkedStaffPayslips() {
  const { data, isLoading } = useGetMyPayslipsQuery();
  const rows = data?.rows ?? [];

  if (isLoading || !data?.linked || rows.length === 0) return null;

  return (
    <div className="space-y-4 border-t pt-6">
      <p className="micro-label">My own payslips</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{monthTitle(p.run?.month)}</p>
                <Badge variant="outline" className="text-[10px]">
                  Finalized
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground tabular">Net {money(p.net)}</p>
            </div>
            <a
              href={`/api/payroll/payslips/${p.id}/pdf`}
              className="inline-flex size-8 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Download payslip PDF"
            >
              <Download className="size-4" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
