"use client";

import * as React from "react";
import { z } from "zod";
import { format } from "date-fns";
import { KeyRound, Loader2, Plus, ShieldCheck, UserCog, Users } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { TempPasswordDialog } from "@/components/modules/employees/temp-password-dialog";
import { avatarToneFor, initialsFor } from "@/components/modules/employees/employee-bits";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { getApiError } from "@/lib/api-error";
import {
  useAddUserMutation,
  useGetUsersQuery,
  useResetUserPasswordMutation,
  useUpdateUserMutation,
} from "@/store/api/employeesApi";

const createSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is too short").max(80, "Name is too long"),
  email: z.string().trim().email("Enter a valid email address"),
  role: z.enum(["admin", "hr"]),
});

const ROLE_LABELS = { admin: "Admin", hr: "HR", employee: "Employee" };

export function UsersClient({ currentUserId }) {
  const { data: users, isLoading } = useGetUsersQuery();
  const [addUser, { isLoading: adding }] = useAddUserMutation();
  const [updateUser, { isLoading: updating }] = useUpdateUserMutation();
  const [resetUserPassword, { isLoading: resetting }] = useResetUserPasswordMutation();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState({ fullName: "", email: "", role: "hr" });
  const [error, setError] = React.useState(null);
  const [credentials, setCredentials] = React.useState(null); // { email, tempPassword, kind: "created" | "reset" }

  // optimistic busy-rows (per user id) — reset password spinner
  const [busyIds, setBusyIds] = React.useState({});
  const setBusy = (id, on) =>
    setBusyIds((m) => ({ ...m, [id]: on ? (m[id] ?? 0) + 1 : Math.max(0, (m[id] ?? 1) - 1) }));

  const rows = users ?? [];

  function openAdd() {
    setForm({ fullName: "", email: "", role: "hr" });
    setError(null);
    setDialogOpen(true);
  }

  async function onAdd(e) {
    e.preventDefault();
    const parsed = createSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    try {
      const res = await addUser(parsed.data).unwrap();
      setDialogOpen(false);
      setCredentials({ email: parsed.data.email, tempPassword: res.data.tempPassword, kind: "created" });
      toast.success("Login created.");
    } catch (err) {
      setError(getApiError(err));
    }
  }

  async function onRoleChange(row, role) {
    if (role === row.role) return;
    try {
      await updateUser({ id: row.id, role }).unwrap();
      toast.success(`${row.email} → ${ROLE_LABELS[role]}`);
    } catch (err) {
      toast.error(getApiError(err, "Role change failed."));
    }
  }

  async function onToggleActive(row) {
    try {
      await updateUser({ id: row.id, isActive: !row.is_active }).unwrap();
      toast.success(row.is_active ? "Login deactivated." : "Login activated.");
    } catch (err) {
      toast.error(getApiError(err, "Status change failed."));
    }
  }

  async function onResetPassword(row) {
    setBusy(row.id, true);
    try {
      const res = await resetUserPassword(row.id).unwrap();
      setCredentials({ email: res.data.email, tempPassword: res.data.tempPassword, kind: "reset" });
    } catch (err) {
      toast.error(getApiError(err, "Password reset failed."));
    } finally {
      setBusy(row.id, false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        index="04"
        eyebrow="Administration"
        title="Users & Logins"
        description="HR/Admin logins yahan banti hain aur manage hoti hain. Employee logins unki registration se automatically banti hain."
        actions={
          <Button onClick={openAdd}>
            <Plus className="size-4" /> Add login
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Users className="size-6" />
              </div>
              <p className="font-medium">No logins yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-5 py-3 font-medium text-muted-foreground">User</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">Role</th>
                    <th className="hidden px-5 py-3 font-medium text-muted-foreground md:table-cell">
                      Linked employee
                    </th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="hidden px-5 py-3 font-medium text-muted-foreground lg:table-cell">
                      Created
                    </th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isSelf = row.id === currentUserId;
                    const busy = (busyIds[row.id] ?? 0) > 0 || updating;
                    return (
                      <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-accent/40">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarToneFor(row.full_name)}`}
                            >
                              {initialsFor(row.full_name)}
                            </span>
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 truncate font-medium">
                                {row.full_name}
                                {isSelf ? (
                                  <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                                    you
                                  </Badge>
                                ) : null}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {isSelf ? (
                            <Badge variant="secondary" className="uppercase">
                              {row.role}
                            </Badge>
                          ) : (
                            <Select
                              value={row.role}
                              onValueChange={(v) => onRoleChange(row, v)}
                              disabled={busy}
                            >
                              <SelectTrigger
                                className="h-8 w-28 text-xs"
                                aria-label={`Role for ${row.email}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="hr">HR</SelectItem>
                                <SelectItem value="employee">Employee</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className="hidden px-5 py-3 md:table-cell">
                          {row.employee_code ? (
                            <p>
                              <span className="tabular">{row.employee_code}</span>
                              <span className="block text-xs text-muted-foreground">
                                {row.employee_name}
                              </span>
                            </p>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {row.is_active ? (
                            <Badge className="border-transparent bg-success/15 text-success hover:bg-success/15">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline">Disabled</Badge>
                          )}
                          {row.must_change_password ? (
                            <Badge variant="outline" className="ml-1.5 border-warning/40 text-warning">
                              temp pw
                            </Badge>
                          ) : null}
                        </td>
                        <td className="hidden px-5 py-3 text-muted-foreground lg:table-cell">
                          {format(new Date(row.created_at), "dd MMM yyyy")}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            {isSelf ? (
                              <span className="pr-2 text-xs text-muted-foreground">
                                Khud ka account
                              </span>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  aria-label={`Toggle ${row.email}`}
                                  disabled={busy}
                                  onClick={() => onToggleActive(row)}
                                >
                                  <ShieldCheck
                                    className={`size-3.5 ${row.is_active ? "text-success" : "text-muted-foreground"}`}
                                  />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8"
                                      aria-label={`More for ${row.email}`}
                                      disabled={busy}
                                    >
                                      {busy ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                      ) : (
                                        <UserCog className="size-3.5" />
                                      )}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => onResetPassword(row)}>
                                      <KeyRound className="size-3.5" /> Reset password (temp)
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            )}
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

      {/* Add login dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add staff login</DialogTitle>
            <DialogDescription>
              Admin ya HR login banayen — temporary password one-time milega. Employee logins
              directory ki registration se banti hain.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="u-name">Full name *</Label>
              <Input
                id="u-name"
                placeholder="e.g. Ayesha HR"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                aria-invalid={Boolean(error)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-email">Email (login) *</Label>
              <Input
                id="u-email"
                type="email"
                placeholder="hr@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-role">Role *</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger id="u-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hr">HR — employees, attendance, leave, payroll</SelectItem>
                  <SelectItem value="admin">Admin — sab kuch + organization + users</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={adding}>
                Cancel
              </Button>
              <Button type="submit" disabled={adding}>
                {adding ? <Loader2 className="size-4 animate-spin" /> : null}
                Create login
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <TempPasswordDialog
        open={Boolean(credentials)}
        onOpenChange={(v) => {
          if (!v) setCredentials(null);
        }}
        email={credentials?.email}
        tempPassword={credentials?.tempPassword}
        title={credentials?.kind === "reset" ? "Password reset" : "Staff login created"}
      />
    </div>
  );
}
