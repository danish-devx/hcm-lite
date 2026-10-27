"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ScrollText, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGetAuditLogQuery } from "@/store/api/commsApi";
import {
  ActionChip,
  RoleBadge,
  avatarToneFor,
  fullStamp,
  groupLabel,
  initialsFor,
} from "./comms-bits";

/**
 * Audit log browser (F25) — admin only.
 * Actor, action chip, entity + expandable before/after JSON dialog.
 */

function DebouncedSearch({ value, onChange }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => onChange(text.trim()), 350);
    return () => window.clearTimeout(t);
  }, [text, onChange]);
  return (
    <div className="relative">
      <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search action, entity, id…"
        className="pl-8"
      />
    </div>
  );
}

function JsonBlock({ label, value }) {
  return (
    <div className="space-y-1">
      <p className="micro-label">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-[11px] leading-relaxed">
        {value == null ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditLogClient() {
  const [q, setQ] = React.useState("");
  const [group, setGroup] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [detail, setDetail] = React.useState(null);

  // STABLE identity — inline arrow re-triggered DebouncedSearch effect har
  // render par aur setPage(1) loop kar raha tha (pagination kabhi aage nahi badhi)
  const handleSearch = React.useCallback((v) => {
    setQ(v);
    setPage(1);
  }, []);

  const filters = React.useMemo(
    () => ({ q, group: group === "all" ? undefined : group, from: from || undefined, to: to || undefined, page }),
    [q, group, from, to, page]
  );
  const { data, isLoading, isFetching } = useGetAuditLogQuery(filters);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        index="09"
        eyebrow="Compliance · Immutable trail"
        title="Audit log"
        description="Har important action ka record — actor, action, entity aur before/after JSON. DB trigger se table immutable hai (update/delete blocked)."
      />

      {/* Filters */}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="audit-q">Search</Label>
            <DebouncedSearch value={q} onChange={handleSearch} />
          </div>
          <div className="space-y-1.5">
            <Label>Action group</Label>
            <Select
              value={group}
              onValueChange={(v) => { setGroup(v); resetPage(); }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {(data?.groups ?? []).map((g) => (
                  <SelectItem key={g} value={g}>
                    {groupLabel(g)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-from">From</Label>
            <Input
              id="audit-from"
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); resetPage(); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-to">To</Label>
            <Input
              id="audit-to"
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); resetPage(); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <ScrollText className="size-8 text-muted-foreground/50" />
              <p className="font-display text-lg">No audit entries match</p>
              <p className="text-sm text-muted-foreground">
                Filters clear karke dobara try karein.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">When</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Actor</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Action</th>
                    <th className="px-4 py-2.5 font-medium text-muted-foreground">Entity</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className={isFetching ? "opacity-60 transition-opacity" : ""}>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b last:border-0 transition-colors hover:bg-accent/40"
                      onClick={() => setDetail(row)}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular">
                        {fullStamp(row.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarFallback
                              className={`text-[9px] font-semibold ${avatarToneFor(row.actor?.full_name)}`}
                            >
                              {initialsFor(row.actor?.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="max-w-36 truncate">{row.actor?.full_name}</span>
                          <RoleBadge role={row.actor_role ?? row.actor?.role} />
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <ActionChip action={row.action} />
                      </td>
                      <td className="max-w-56 px-4 py-2.5">
                        <div className="truncate text-muted-foreground">
                          {row.entity}
                          {row.entity_id ? (
                            <span className="ml-1 text-xs opacity-70">
                              · {String(row.entity_id).slice(0, 13)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-medium whitespace-nowrap text-primary">
                        Details
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground tabular">
            {total} entries · page {data?.page ?? 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={(data?.page ?? 1) <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(data?.page ?? 1) >= totalPages || isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <ActionChip action={detail?.action ?? ""} />
              <span className="text-sm font-normal text-muted-foreground">
                {fullStamp(detail?.created_at)}
              </span>
            </DialogTitle>
            <DialogDescription>
              {detail?.actor?.full_name}
              {detail?.actor?.email ? ` · ${detail.actor.email}` : ""} ·{" "}
              {detail?.entity}
              {detail?.entity_id ? ` (${detail.entity_id})` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <JsonBlock label="Before" value={detail?.before_json} />
            <JsonBlock label="After" value={detail?.after_json} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
