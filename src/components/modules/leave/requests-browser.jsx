"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, History, Loader2, Search } from "lucide-react";

import {
  LeaveStatusBadge,
  rangeLabel,
  stampLabel,
} from "@/components/modules/leave/leave-bits";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetLeaveRequestsQuery } from "@/store/api/leaveApi";

/**
 * Requests browser (M5 staff) — poori leave history: status/type/search
 * filters + pagination. Inbox alag hai (sirf pending w/ actions).
 */

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export function RequestsBrowser({ leaveTypes = [], tz = "Asia/Karachi" }) {
  const [status, setStatus] = React.useState("all");
  const [type, setType] = React.useState("all");
  const [qInput, setQInput] = React.useState("");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);

  // debounce search
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const { data, isLoading, isFetching } = useGetLeaveRequestsQuery({
    status: status === "all" ? "" : status,
    type: type === "all" ? "" : type,
    q,
    page,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-primary" /> Leave requests
        </CardTitle>
        <CardDescription>
          Poori leave history — filters lagao, decisions review karo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, email, code…"
              className="pl-9"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {leaveTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </div>

        {/* Table */}
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
            <History className="size-6 text-muted-foreground/60" />
            <p className="max-w-56 text-xs text-muted-foreground">
              Is filter ke saath koi request nahi mili.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Employee</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Dates</th>
                  <th className="px-4 py-2.5 font-medium">Days</th>
                  <th className="px-4 py-2.5 font-medium">Reason</th>
                  <th className="px-4 py-2.5 font-medium">Applied</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight">{r.full_name ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground tabular">{r.code ?? r.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.type_name}
                      <span className="ml-1 text-muted-foreground">({r.type_paid ? "paid" : "unpaid"})</span>
                    </td>
                    <td className="px-4 py-3 text-xs tabular">{rangeLabel(r.start_date, r.end_date)}</td>
                    <td className="px-4 py-3 text-xs tabular">{Number(r.days)}</td>
                    <td className="max-w-44 px-4 py-3">
                      <p className="truncate text-xs text-muted-foreground">“{r.reason}”</p>
                      {r.decision_comment ? (
                        <p className="truncate text-[11px] italic text-muted-foreground/80">
                          → “{r.decision_comment}”
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground">
                      {stampLabel(r.created_at, tz)}
                    </td>
                    <td className="px-4 py-3">
                      <LeaveStatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 0 ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p className="tabular">
              {total} request{total === 1 ? "" : "s"} · page {page}/{totalPages}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="size-7 rounded-full"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-7 rounded-full"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
