"use client";

import * as React from "react";
import { z } from "zod";
import { format, isBefore, startOfDay } from "date-fns";
import { CalendarDays, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/modules/org/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getApiError } from "@/lib/api-error";
import {
  useAddHolidayMutation,
  useDeleteHolidayMutation,
  useGetHolidaysQuery,
  useUpdateHolidayMutation,
} from "@/store/api/organizationApi";

const formSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
  name: z.string().trim().min(2, "Name is too short").max(80, "Name is too long"),
});

const EMPTY_FORM = { date: "", name: "" };

export function HolidaysClient() {
  const { data: holidays, isLoading } = useGetHolidaysQuery();

  const [addHoliday, { isLoading: adding }] = useAddHolidayMutation();
  const [updateHoliday, { isLoading: updating }] = useUpdateHolidayMutation();
  const [deleteHoliday, { isLoading: deleting }] = useDeleteHolidayMutation();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [errors, setErrors] = React.useState({});
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  const today = startOfDay(new Date());

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({ date: row.date, name: row.name });
    setErrors({});
    setDialogOpen(true);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path[0]] = issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    try {
      if (editing) {
        await updateHoliday({ id: editing.id, ...parsed.data }).unwrap();
        toast.success("Holiday updated.");
      } else {
        await addHoliday(parsed.data).unwrap();
        toast.success("Holiday added.");
      }
      setDialogOpen(false);
    } catch (err) {
      setErrors({ date: getApiError(err) });
    }
  }

  async function onDelete() {
    try {
      await deleteHoliday(deleteTarget.id).unwrap();
      toast.success("Holiday deleted.");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getApiError(err, "Could not delete holiday."));
      setDeleteTarget(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        index="05"
        eyebrow="Organization"
        title="Holidays"
        description="Official holidays — leave calculation aur attendance me in dinon ko working days nahi gina jayega."
        actions={
          <Button onClick={openAdd}>
            <Plus className="size-4" /> Add holiday
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !holidays?.length ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarDays className="size-6" />
              </div>
              <div>
                <p className="font-medium">No holidays yet</p>
                <p className="text-sm text-muted-foreground">
                  Eid, Independence Day waghera add karein — payroll aur leave calculations inhe
                  respect karengi.
                </p>
              </div>
              <Button variant="outline" onClick={openAdd}>
                <Plus className="size-4" /> Add holiday
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-5 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">Holiday</th>
                    <th className="hidden px-5 py-3 font-medium text-muted-foreground sm:table-cell">
                      Status
                    </th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((row) => {
                    const past = isBefore(startOfDay(new Date(row.date)), today);
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b transition-colors last:border-0 hover:bg-accent/40",
                          past && "opacity-60"
                        )}
                      >
                        <td className="px-5 py-3 font-medium tabular">
                          {format(new Date(row.date), "EEE, dd MMM yyyy")}
                        </td>
                        <td className="px-5 py-3">{row.name}</td>
                        <td className="hidden px-5 py-3 sm:table-cell">
                          {past ? (
                            <Badge variant="outline">Past</Badge>
                          ) : (
                            <Badge className="border-transparent bg-success/15 text-success hover:bg-success/15">
                              Upcoming
                            </Badge>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`Edit ${row.name}`}
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              aria-label={`Delete ${row.name}`}
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit holiday" : "Add holiday"}</DialogTitle>
            <DialogDescription>
              {editing ? "Date ya naam update karein." : "Official holiday ka date aur naam."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="holiday-date">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                aria-invalid={Boolean(errors.date)}
                autoFocus
              />
              {errors.date ? <p className="text-xs text-destructive">{errors.date}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="holiday-name">Holiday name</Label>
              <Input
                id="holiday-name"
                placeholder="e.g. Independence Day"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={adding || updating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={adding || updating}>
                {adding || updating ? <Loader2 className="size-4 animate-spin" /> : null}
                {editing ? "Save changes" : "Add holiday"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => {
          if (!v) setTimeout(() => setDeleteTarget(null), 250); // exit animation ke baad clear — "undefined" flash fix
        }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Ye holiday list se hamesha ke liye hat jayegi."
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  );
}
