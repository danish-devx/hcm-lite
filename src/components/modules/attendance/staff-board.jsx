"use client";

import * as React from "react";
import { CalendarDays, Inbox, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { AttendanceStatusBadge, CorrectionStatusBadge, shortDate, timeInTz } from "./attendance-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { avatarToneFor, initialsFor } from "@/components/modules/employees/employee-bits";
import { getApiError } from "@/lib/api-error";
import {
  useDecideCorrectionMutation,
  useGetCorrectionsQuery,
  useGetDailyBoardQuery,
} from "@/store/api/attendanceApi";
import { useGetDepartmentsQuery } from "@/store/api/organizationApi";

/**
 * Staff attendance board (M4) — daily board (date + dept + search, summary
 * chips, per-employee effective status) + corrections inbox (approve/reject
 * with comment) + records browser (date range, status filter, pagination).
 */

const SUMMARY_ORDER = [
  ["present", "On time"],
  ["late", "Late"],
  ["half_day", "Half day"],
  ["missing_checkout", "Missing checkout"],
  ["on_leave", "On leave"],
  ["absent", "Absent"],
  ["not_checked_in", "Not in yet"],
  ["weekend", "Weekend"],
  ["holiday", "Holiday"],
];

export function StaffAttendanceBoard({ todayIso }) {
  // ---- Filters ----
  const [date, setDate] = React.useState("");
  // server-tz aane par default set (sirf pehli dafa — user ki choice respect)
  React.useEffect(() => {
    const t = window.setTimeout(() => setDate((d) => d || todayIso || ""), 0);
    return () => window.clearTimeout(t);
  }, [todayIso]);
  const [department, setDepartment] = React.useState("all");
  const [searchInput, setSearchInput] = React.useState("");
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    const t = window.setTimeout(() => setQ(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data: departments } = useGetDepartmentsQuery();
  const boardFilters = {
    date,
    department: department === "all" ? "" : department,
    q,
  };
  const { data: board, isLoading } = useGetDailyBoardQuery(boardFilters);

  // ---- Corrections inbox ----
  const [decideOpen, setDecideOpen] = React.useState(null); // { correction, decision }
  const [comment, setComment] = React.useState("");
  const { data: pending } = useGetCorrectionsQuery({ status: "pending" }, { pollingInterval: 60_000 });
  const [decideCorrection, { isLoading: deciding }] = useDecideCorrectionMutation();

  async function confirmDecision() {
    try {
      await decideCorrection({
        id: decideOpen.correction.id,
        decision: decideOpen.decision,
        comment: comment.trim(),
      }).unwrap();
      toast.success(
        decideOpen.decision === "approve"
          ? "Correction approved — attendance record updated."
          : "Correction rejected."
      );
      setDecideOpen(null);
      setComment("");
    } catch (err) {
      toast.error(getApiError(err).message);
    }
  }

  const summary = board?.summary ?? { total: 0 };
  const rows = board?.rows ?? [];

  return (
    <div className="space-y-6">
      {/* Date flags */}
      {board?.is_holiday || board?.is_weekend ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-warning/40 text-warning">
            {board?.is_holiday ? `Public holiday — ${board?.holiday_name ?? "Office closed"}` : "Weekend"}
          </Badge>
          <span className="text-xs text-muted-foreground">Board is still shown; punches are still counted.</span>
        </div>
      ) : null}

      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2">
        {SUMMARY_ORDER.map(([key, label]) =>
          summary[key] ? (
            <span
              key={key}
              className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs"
            >
              {label}
              <span className="font-display text-sm font-semibold tabular">{summary[key]}</span>
            </span>
          ) : null
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular">
          {summary.total} active {summary.total === 1 ? "employee" : "employees"}
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, code or email…"
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {(departments ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label htmlFor="board-date" className="sr-only">
          Board date
        </Label>
        <Input
          id="board-date"
          type="date"
          aria-label="Board date"
          max={board?.today ?? todayIso}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-40"
        />
      </div>

      {/* Board table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <CalendarDays className="size-7 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                No active employees match these filters — directory me employees add karein.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Check in</th>
                    <th className="px-4 py-3 font-medium">Check out</th>
                    <th className="px-4 py-3 font-medium">Worked</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.employee_id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarToneFor(r.full_name)}`}
                          >
                            {initialsFor(r.full_name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{r.full_name}</p>
                            <p className="text-[11px] text-muted-foreground tabular">{r.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.department_name ?? "—"}</td>
                      <td className="px-4 py-3 tabular">{timeInTz(r.check_in, board?.timezone)}</td>
                      <td className="px-4 py-3 tabular">{timeInTz(r.check_out, board?.timezone)}</td>
                      <td className="px-4 py-3 tabular">{r.worked}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <AttendanceStatusBadge status={r.status} label={r.status_label} />
                          {r.source ? (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {r.source}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Corrections inbox */}
      <CorrectionsInbox
        pending={pending ?? []}
        onDecide={(correction, decision) => {
          setComment("");
          setDecideOpen({ correction, decision });
        }}
        tz={board?.timezone ?? "Asia/Karachi"}
      />

      {/* Decision dialog */}
      <Dialog open={Boolean(decideOpen)} onOpenChange={(o) => !o && setDecideOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decideOpen?.decision === "approve" ? "Approve correction" : "Reject correction"}
            </DialogTitle>
            <DialogDescription>
              {decideOpen?.decision === "approve"
                ? "Attendance record isi request ke times se update ho jayega (status recompute hoga)."
                : "Request rejected mark hogi — attendance record unchanged rahega."}
            </DialogDescription>
          </DialogHeader>
          {decideOpen ? (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                {decideOpen.correction.full_name}{" "}
                <span className="text-xs font-normal text-muted-foreground tabular">
                  · {decideOpen.correction.code}
                </span>
              </p>
              <p className="text-muted-foreground">
                {shortDate(decideOpen.correction.date)} → in{" "}
                <span className="tabular text-foreground">{timeInTz(decideOpen.correction.requested_check_in, board?.timezone ?? "Asia/Karachi")}</span>, out{" "}
                <span className="tabular text-foreground">{timeInTz(decideOpen.correction.requested_check_out, board?.timezone ?? "Asia/Karachi")}</span>
              </p>
              <p className="text-xs italic text-muted-foreground">“{decideOpen.correction.reason}”</p>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="decision-comment">Comment (optional)</Label>
            <Textarea
              id="decision-comment"
              rows={2}
              placeholder="Visible to the employee…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideOpen(null)}>
              Cancel
            </Button>
            <Button
              onClick={confirmDecision}
              disabled={deciding}
              variant={decideOpen?.decision === "approve" ? "default" : "destructive"}
            >
              {deciding ? <Loader2 className="size-4 animate-spin" /> : null}
              {decideOpen?.decision === "approve" ? "Approve & apply" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Pending corrections inbox — HR/Admin review queue. */
function CorrectionsInbox({ pending, onDecide, tz }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Inbox className="size-4 text-primary" /> Correction requests
            </CardTitle>
            <CardDescription>Employee-raised fixes — approve karne par record apply hota hai.</CardDescription>
          </div>
          {pending.length > 0 ? (
            <Badge className="border-transparent bg-warning/15 text-warning hover:bg-warning/15 tabular">
              {pending.length} pending
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
            Sab clear — koi pending correction nahi.
          </p>
        ) : (
          <ul className="divide-y">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
                <div className="min-w-40">
                  <p className="font-medium">{c.full_name ?? "Employee"}</p>
                  <p className="text-[11px] text-muted-foreground tabular">
                    {c.code} · {shortDate(c.date)}
                  </p>
                </div>
                <div className="min-w-56 flex-1">
                  <p className="tabular text-xs">
                    In {timeInTz(c.requested_check_in, tz)} · Out {timeInTz(c.requested_check_out, tz)}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">“{c.reason}”</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => onDecide(c, "reject")}>
                    Reject
                  </Button>
                  <Button size="sm" className="rounded-full" onClick={() => onDecide(c, "approve")}>
                    Approve
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
