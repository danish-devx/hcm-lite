"use client";

import * as React from "react";
import { z } from "zod";
import { format } from "date-fns";
import { Award, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiError } from "@/lib/api-error";
import {
  useAddDesignationMutation,
  useDeleteDesignationMutation,
  useGetDepartmentsQuery,
  useGetDesignationsQuery,
  useUpdateDesignationMutation,
} from "@/store/api/organizationApi";

const nameSchema = z.string().trim().min(2, "Name is too short").max(80, "Name is too long");

export function DesignationsClient() {
  const { data: designations, isLoading } = useGetDesignationsQuery();
  const { data: departments } = useGetDepartmentsQuery();

  const [addDesignation, { isLoading: adding }] = useAddDesignationMutation();
  const [updateDesignation, { isLoading: updating }] = useUpdateDesignationMutation();
  const [deleteDesignation, { isLoading: deleting }] = useDeleteDesignationMutation();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState({ name: "", departmentId: "none" });
  const [error, setError] = React.useState(null);
  const [deleteTarget, setDeleteTarget] = React.useState(null);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", departmentId: "none" });
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({ name: row.name, departmentId: row.department_id ?? "none" });
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
    const departmentId = form.departmentId === "none" ? null : form.departmentId;
    try {
      if (editing) {
        await updateDesignation({ id: editing.id, name: parsed.data, departmentId }).unwrap();
        toast.success("Designation updated.");
      } else {
        await addDesignation({ name: parsed.data, departmentId }).unwrap();
        toast.success("Designation added.");
      }
      setDialogOpen(false);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  async function onDelete() {
    try {
      await deleteDesignation(deleteTarget.id).unwrap();
      toast.success("Designation deleted.");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getApiError(err, "Could not delete designation."));
      setDeleteTarget(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        index="03"
        eyebrow="Organization"
        title="Designations"
        description="Job titles — har designation kisi department se link ho sakti hai."
        actions={
          <Button onClick={openAdd}>
            <Plus className="size-4" /> Add designation
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
          ) : !designations?.length ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Award className="size-6" />
              </div>
              <div>
                <p className="font-medium">No designations yet</p>
                <p className="text-sm text-muted-foreground">
                  Job titles add karein — employee registration me yehi select honge.
                </p>
              </div>
              <Button variant="outline" onClick={openAdd}>
                <Plus className="size-4" /> Add designation
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-5 py-3 font-medium text-muted-foreground">Title</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">Department</th>
                    <th className="hidden px-5 py-3 font-medium text-muted-foreground sm:table-cell">
                      Created
                    </th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {designations.map((row) => (
                    <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                      <td className="px-5 py-3 font-medium">{row.name}</td>
                      <td className="px-5 py-3">
                        {row.department ? (
                          <Badge variant="secondary">{row.department.name}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit designation" : "Add designation"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Title ya department update karein."
                : "Naya job title — optional department ke saath."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="desig-name">Designation title</Label>
              <Input
                id="desig-name"
                placeholder="e.g. Senior Software Engineer"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                aria-invalid={Boolean(error)}
                autoFocus
              />
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={form.departmentId}
                onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No department</SelectItem>
                  {(departments ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                {editing ? "Save changes" : "Add designation"}
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
        description="Ye action wapas nahi hoga. Agar employees linked hain to delete block ho jayega."
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  );
}
