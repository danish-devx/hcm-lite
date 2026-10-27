"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Rows3 } from "lucide-react";

import { AttendanceStatusBadge, shortDate, timeInTz } from "./attendance-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useGetAttendanceRecordsQuery } from "@/store/api/attendanceApi";

/**
 * Records browser (M4) — HR/Admin: date-range + status filter + search +
 * pagination. Har recorded punch ki detail (in/out/worked/source).
 */

const STATUS_OPTIONS = [
  ["", "All statuses"],
  ["present", "On time"],
  ["late", "Late"],
  ["half_day", "Half day"],
  ["missing_checkout", "Missing checkout"],
];

export function RecordsBrowser({ todayIso }) {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  // server-tz aane par defaults (async query ke baad)
  React.useEffect(() => {
    if (!todayIso) return undefined;
    const t = window.setTimeout(() => {
      setFrom((f) => f || `${todayIso.slice(0, 7)}-01`);
      setTo((cur) => cur || todayIso);
    }, 0);
    return () => window.clearTimeout(t);
  }, [todayIso]);
  const [status, setStatus] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useGetAttendanceRecordsQuery({ from, to, status, q, page });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.pageSize ?? 20)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rows3 className="size-4 text-primary" /> Records
        </CardTitle>
        <CardDescription>
          {total} punch{total === 1 ? "" : "es"} in range — filters + pagination, payroll-ready history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="rec-from" className="text-[11px] text-muted-foreground">
              From
            </Label>
            <Input
              id="rec-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="rec-to" className="text-[11px] text-muted-foreground">
              To
            </Label>
            <Input
              id="rec-to"
              type="date"
              value={to}
              min={from}
              max={todayIso}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="w-40"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[11px] text-muted-foreground">Status</Label>
            <Select
              value={status || "all"}
              onValueChange={(v) => {
                setStatus(v === "all" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(([v, l]) => (
                  <SelectItem key={v || "all"} value={v || "all"}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid flex-1 gap-1 sm:max-w-60">
            <Label className="text-[11px] text-muted-foreground">Search</Label>
            <Input
              placeholder="Name or code…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Is range me koi punch record nahi mila.
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${isFetching ? "opacity-60" : ""}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Employee</th>
                  <th className="px-3 py-2.5 font-medium">Department</th>
                  <th className="px-3 py-2.5 font-medium">In</th>
                  <th className="px-3 py-2.5 font-medium">Out</th>
                  <th className="px-3 py-2.5 font-medium">Worked</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-3 py-2.5 tabular whitespace-nowrap">{shortDate(r.date)}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{r.full_name}</p>
                      <p className="text-[11px] text-muted-foreground tabular">{r.code}</p>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.department_name ?? "—"}</td>
                    <td className="px-3 py-2.5 tabular">{timeInTz(r.check_in, "Asia/Karachi")}</td>
                    <td className="px-3 py-2.5 tabular">{timeInTz(r.check_out, "Asia/Karachi")}</td>
                    <td className="px-3 py-2.5 tabular">{r.worked}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <AttendanceStatusBadge status={r.status} label={r.status_label} />
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.source}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between border-t pt-3">
          <p className="text-xs text-muted-foreground tabular">
            Page {data?.page ?? 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
