"use client";

import * as React from "react";
import { z } from "zod";
import { CalendarRange, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { getApiError } from "@/lib/api-error";
import {
  useAddLeaveTypeMutation,
  useDeleteLeaveTypeMutation,
  useGetLeaveTypesQuery,
  useUpdateLeaveTypeMutation,
} from "@/store/api/organizationApi";

const formSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(60, "Name is too long"),
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9_]{1,23}$/, "Use lowercase letters/numbers, start with a letter"),
    isPaid: z.boolean(),
    yearlyQuota: z.union([z.coerce.number().min(0.5, "Minimum 0.5").max(365), z.literal("")]),
  })
  .refine((v) => !v.isPaid || v.yearlyQuota !== "", {
    message: "Paid leave types need a yearly quota",
    path: ["yearlyQuota"],
  });

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

const EMPTY_FORM = { name: "", code: "", isPaid: true, yearlyQuota: "" };

export function LeaveTypesClient() {
  const { data: leaveTypes, isLoading } = useGetLeaveTypesQuery();

  const [addLeaveType, { isLoading: adding }] = useAddLeaveTypeMutation();
  const [updateLeaveType, { isLoading: updating }] = useUpdateLeaveTypeMutation();
  const [deleteLeaveType, { isLoading: deleting }] = useDeleteLeaveTypeMutation();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [errors, setErrors] = React.useState({});
  const [codeTouched, setCodeTouched] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setCodeTouched(false);
    setDialogOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      name: row.name,
      code: row.code,
      isPaid: row.is_paid,
      yearlyQuota: row.yearly_quota != null ? String(Number(row.yearly_quota)) : "",
    });
    setErrors({});
    setCodeTouched(true); // edit me code immutable hai
    setDialogOpen(true);
  }

  function onNameChange(value) {
    setForm((f) => ({
      ...f,
      name: value,
      code: !codeTouched && !editing ? slugify(value) : f.code,
    }));
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

    const payload = {
      name: parsed.data.name,
      isPaid: parsed.data.isPaid,
      yearlyQuota: parsed.data.yearlyQuota === "" ? null : parsed.data.yearlyQuota,
    };

    try {
      if (editing) {
        await updateLeaveType({ id: editing.id, ...payload }).unwrap();
        toast.success("Leave type updated.");
      } else {
        await addLeaveType({ ...payload, code: parsed.data.code }).unwrap();
        toast.success("Leave type added.");
      }
      setDialogOpen(false);
    } catch (err) {
      const message = getApiError(err);
      if (/code/i.test(message)) setErrors((e) => ({ ...e, code: message }));
      else setErrors((e) => ({ ...e, name: message }));
    }
  }

  async function onDelete() {
    try {
      await deleteLeaveType(deleteTarget.id).unwrap();
      toast.success("Leave type deleted.");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getApiError(err, "Could not delete leave type."));
      setDeleteTarget(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        index="04"
        eyebrow="Organization"
        title="Leave Types"
        description="Annual, sick, casual aur baqi quotas — leave approval inhi balances par chalega."
        actions={
          <Button onClick={openAdd}>
            <Plus className="size-4" /> Add leave type
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
          ) : !leaveTypes?.length ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarRange className="size-6" />
              </div>
              <div>
                <p className="font-medium">No leave types yet</p>
                <p className="text-sm text-muted-foreground">
                  Kam se kam ek paid leave type zaroori hai (e.g. Annual — 14 days).
                </p>
              </div>
              <Button variant="outline" onClick={openAdd}>
                <Plus className="size-4" /> Add leave type
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-5 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="hidden px-5 py-3 font-medium text-muted-foreground sm:table-cell">
                      Code
                    </th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">Yearly quota</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaveTypes.map((row) => (
                    <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                      <td className="px-5 py-3 font-medium">{row.name}</td>
                      <td className="hidden px-5 py-3 sm:table-cell">
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {row.code}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 tabular">
                        {row.yearly_quota != null ? `${Number(row.yearly_quota)} days` : "Unlimited"}
                      </td>
                      <td className="px-5 py-3">
                        {row.is_paid ? (
                          <Badge className="border-transparent bg-success/15 text-success hover:bg-success/15">
                            Paid
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Unpaid</Badge>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit leave type" : "Add leave type"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Naam, quota ya paid status update karein."
                : "Naya leave type — code automatic ban jayega, edit bhi kar sakte hain."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lt-name">Name</Label>
              <Input
                id="lt-name"
                placeholder="e.g. Annual Leave"
                value={form.name}
                onChange={(e) => onNameChange(e.target.value)}
                aria-invalid={Boolean(errors.name)}
                autoFocus
              />
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lt-code">Code</Label>
              <Input
                id="lt-code"
                placeholder="e.g. annual"
                value={form.code}
                disabled={Boolean(editing)}
                onChange={(e) => {
                  setCodeTouched(true);
                  setForm((f) => ({ ...f, code: e.target.value }));
                }}
                aria-invalid={Boolean(errors.code)}
                className="font-mono"
              />
              {errors.code ? <p className="text-xs text-destructive">{errors.code}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lt-quota">Yearly quota (days)</Label>
                <Input
                  id="lt-quota"
                  type="number"
                  min="0.5"
                  max="365"
                  step="0.5"
                  placeholder={form.isPaid ? "14" : "blank = unlimited"}
                  value={form.yearlyQuota}
                  onChange={(e) => setForm((f) => ({ ...f, yearlyQuota: e.target.value }))}
                  aria-invalid={Boolean(errors.yearlyQuota)}
                />
                {errors.yearlyQuota ? (
                  <p className="text-xs text-destructive">{errors.yearlyQuota}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Paid?</Label>
                <label className="flex h-9 cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={form.isPaid}
                    onChange={(e) => setForm((f) => ({ ...f, isPaid: e.target.checked }))}
                  />
                  {form.isPaid ? "Paid leave" : "Unpaid leave"}
                </label>
              </div>
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
                {editing ? "Save changes" : "Add leave type"}
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
        description="Agar is type par leave requests already maujood hain to delete block ho jayega."
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  );
}
