"use client";

import * as React from "react";
import { z } from "zod";
import { format } from "date-fns";
import { Building2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDialog } from "@/components/modules/org/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
  useAddDepartmentMutation,
  useDeleteDepartmentMutation,
  useGetDepartmentsQuery,
  useUpdateDepartmentMutation,
} from "@/store/api/organizationApi";

const nameSchema = z.string().trim().min(2, "Name is too short").max(60, "Name is too long");

export function DepartmentsClient() {
  const { data: departments, isLoading } = useGetDepartmentsQuery();

  const [addDepartment, { isLoading: adding }] = useAddDepartmentMutation();
  const [updateDepartment, { isLoading: updating }] = useUpdateDepartmentMutation();
  const [deleteDepartment, { isLoading: deleting }] = useDeleteDepartmentMutation();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null); // row ya null (add mode)
  const [form, setForm] = React.useState({ name: "", isActive: true });
  const [error, setError] = React.useState(null);
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", isActive: true });
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({ name: row.name, isActive: row.is_active });
    setError(null);
    setDialogOpen(true);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const parsed = nameSchema.safeParse(form.name);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    try {
      if (editing) {
        await updateDepartment({ id: editing.id, name: parsed.data, isActive: form.isActive }).unwrap();
        toast.success("Department updated.");
      } else {
        await addDepartment({ name: parsed.data, isActive: form.isActive }).unwrap();
        toast.success("Department added.");
      }
      setDialogOpen(false);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  async function onDelete() {
    try {
      await deleteDepartment(deleteTarget.id).unwrap();
      toast.success("Department deleted.");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getApiError(err, "Could not delete department."));
      setDeleteTarget(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        index="02"
        eyebrow="Organization"
        title="Departments"
        description="Company ke sections — employees aur designations inhi se link honge."
        actions={
          <Button onClick={openAdd}>
            <Plus className="size-4" /> Add department
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
          ) : !departments?.length ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="size-6" />
              </div>
              <div>
                <p className="font-medium">No departments yet</p>
                <p className="text-sm text-muted-foreground">
                  Pehla department add karein — phir designations aur employees usi me aayenge.
                </p>
              </div>
              <Button variant="outline" onClick={openAdd}>
                <Plus className="size-4" /> Add department
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-5 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="hidden px-5 py-3 font-medium text-muted-foreground sm:table-cell">
                      Created
                    </th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((row) => (
                    <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                      <td className="px-5 py-3 font-medium">{row.name}</td>
                      <td className="px-5 py-3">
                        {row.is_active ? (
                          <Badge className="border-transparent bg-success/15 text-success hover:bg-success/15">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </td>
                      <td className="hidden px-5 py-3 text-muted-foreground sm:table-cell">
                        {format(new Date(row.created_at), "dd MMM yyyy")}
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

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit department" : "Add department"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Naam ya status update karein."
                : "Naya department banayen — ye employees aur designations me select hoga."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dept-name">Department name</Label>
              <Input
                id="dept-name"
                placeholder="e.g. Engineering"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                aria-invalid={Boolean(error)}
                autoFocus
              />
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              Active (new employees me selectable)
            </label>
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
                {editing ? "Save changes" : "Add department"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => {
          if (!v) setTimeout(() => setDeleteTarget(null), 250); // exit animation ke baad clear — "undefined" flash fix
        }}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Ye action wapas nahi hoga. Is department se linked designations automatically 'No department' ho jayengi (delete nahi hongi)."
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  );
}
