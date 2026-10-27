"use client";

import * as React from "react";
import { z } from "zod";
import { format } from "date-fns";
import {
  ArrowLeft,
  Briefcase,
  CalendarCheck2,
  CalendarClock,
  Clock,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/modules/org/confirm-dialog";
import { TempPasswordDialog } from "@/components/modules/employees/temp-password-dialog";
import {
  EmployeeStatusBadge,
  avatarToneFor,
  formatDate,
  formatMoney,
  initialsFor,
} from "@/components/modules/employees/employee-bits";
import { AnimatedContent } from "@/components/react-bits/animated-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { getApiError } from "@/lib/api-error";
import {
  useGetEmployeeQuery,
  useResetEmployeePasswordMutation,
  useUpdateEmployeeMutation,
} from "@/store/api/employeesApi";
import {
  useGetDepartmentsQuery,
  useGetDesignationsQuery,
} from "@/store/api/organizationApi";

const editFormSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is too short").max(80, "Name is too long"),
  joinDate: z.string().min(1, "Join date is required"),
});

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="micro-label text-[10px]">{label}</p>
        <p className="mt-0.5 text-sm break-words">{value || "—"}</p>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </div>
        <div className="min-w-0">
          <p className="micro-label text-[10px]">{label}</p>
          <p className="font-display text-xl font-medium tabular">{value}</p>
          {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function Employee360Client({ employeeId }) {
  const { data, isLoading, error: loadError } = useGetEmployeeQuery(employeeId);
  const { data: departments } = useGetDepartmentsQuery();
  const { data: designations } = useGetDesignationsQuery();

  const [updateEmployee, { isLoading: updating }] = useUpdateEmployeeMutation();
  const [resetPassword, { isLoading: resetting }] = useResetEmployeePasswordMutation();

  const [editOpen, setEditOpen] = React.useState(false);
  const [form, setForm] = React.useState(null);
  const [formError, setFormError] = React.useState(null);
  const [statusTarget, setStatusTarget] = React.useState(null); // "inactive" | "active"
  const [credentials, setCredentials] = React.useState(null);

  const employee = data?.employee;
  const login = data?.login;
  const attendance = data?.attendance;
  const leave = data?.leave;

  function openEdit() {
    setForm({
      fullName: employee.full_name ?? "",
      phone: employee.phone ?? "",
      address: employee.address ?? "",
      gender: employee.gender ?? "",
      departmentId: employee.department_id ?? "",
      designationId: employee.designation_id ?? "",
      joinDate: employee.join_date ?? "",
      exitDate: employee.exit_date ?? "",
      basicSalary: employee.basic_salary ?? 0,
    });
    setFormError(null);
    setEditOpen(true);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onEditSubmit(e) {
    e.preventDefault();
    const parsed = editFormSchema.safeParse({ fullName: form.fullName, joinDate: form.joinDate });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0].message);
      return;
    }
    try {
      await updateEmployee({
        id: employeeId,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        gender: form.gender || "",
        departmentId: form.departmentId || "",
        designationId: form.designationId || "",
        joinDate: form.joinDate,
        exitDate: form.exitDate || "",
        basicSalary: Number(form.basicSalary) || 0,
      }).unwrap();
      toast.success("Employee updated.");
      setEditOpen(false);
    } catch (err) {
      setFormError(getApiError(err));
    }
  }

  async function onStatusConfirm() {
    try {
      await updateEmployee({ id: employeeId, status: statusTarget }).unwrap();
      toast.success(
        statusTarget === "active"
          ? "Employee reactivated — login bhi active kar diya."
          : "Employee deactivated — login bhi band kar diya."
      );
      setStatusTarget(null);
    } catch (err) {
      toast.error(getApiError(err, "Could not update status."));
      setStatusTarget(null);
    }
  }

  async function onResetPassword() {
    try {
      const res = await resetPassword(employeeId).unwrap();
      setCredentials({ email: res.data.email, tempPassword: res.data.tempPassword });
    } catch (err) {
      toast.error(getApiError(err, "Could not reset password."));
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-36 w-full" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError || !employee) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-medium">Employee nahi mila</p>
            <p className="text-sm text-muted-foreground">
              Ye record delete ho chuka ho ya link ghalat hai.
            </p>
            <Button variant="outline" asChild>
              <Link href="/employees">
                <ArrowLeft className="size-4" /> Back to directory
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const deptOptions = (departments ?? []).filter((d) => d.is_active);
  const desigOptions = (designations ?? []).filter(
    (d) => !form?.departmentId || !d.department_id || d.department_id === form.departmentId
  );
  const isActiveEmployee = employee.status === "active";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2" asChild>
        <Link href="/employees">
          <ArrowLeft className="size-4" /> Directory
        </Link>
      </Button>

      {/* Identity header */}
      <AnimatedContent>
        <Card className="overflow-hidden">
          <div className="relative">
            <div className="pointer-events-none absolute -top-20 -right-10 size-48 rounded-full bg-primary/10 blur-3xl" />
            <CardContent className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
              <span
                className={`flex size-16 shrink-0 items-center justify-center rounded-full font-display text-xl font-semibold ${avatarToneFor(employee.full_name)}`}
              >
                {initialsFor(employee.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl font-medium tracking-tight">
                    {employee.full_name}
                  </h2>
                  <EmployeeStatusBadge status={employee.status} />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {employee.designation_name ?? "No designation"} ·{" "}
                  {employee.department_name ?? "No department"} ·{" "}
                  <span className="tabular">{employee.code}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={openEdit}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setStatusTarget(isActiveEmployee ? "inactive" : "active")
                    }
                  >
                    <ShieldCheck className="size-3.5" />
                    {isActiveEmployee ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </div>
        </Card>
      </AnimatedContent>

      {/* Attendance + leave snapshot */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={CalendarCheck2}
          label="Present (30d)"
          value={attendance?.present ?? 0}
          sub={`${attendance?.total ?? 0} days recorded`}
        />
        <StatCard
          icon={Clock}
          label="Late arrivals"
          value={attendance?.late ?? 0}
          sub={attendance?.avg_check_in_label ? `avg in ${attendance.avg_check_in_label}` : "no check-ins yet"}
        />
        <StatCard
          icon={CalendarClock}
          label="Half days"
          value={attendance?.half_day ?? 0}
          sub="last 30 days"
        />
        <StatCard
          icon={Briefcase}
          label="Leave taken"
          value={`${leave?.approved_days ?? 0}d`}
          sub={`${leave?.pending_requests ?? 0} pending this year`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Job details */}
        <AnimatedContent delay={0.05}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Briefcase className="size-4 text-primary" /> Job details
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              <InfoRow icon={Briefcase} label="Department" value={employee.department_name} />
              <InfoRow icon={Briefcase} label="Designation" value={employee.designation_name} />
              <InfoRow icon={CalendarClock} label="Joined on" value={formatDate(employee.join_date)} />
              <InfoRow
                icon={Briefcase}
                label="Basic salary"
                value={formatMoney(employee.basic_salary)}
              />
              {employee.exit_date ? (
                <InfoRow icon={CalendarClock} label="Exit date" value={formatDate(employee.exit_date)} />
              ) : null}
            </CardContent>
          </Card>
        </AnimatedContent>

        {/* Contact */}
        <AnimatedContent delay={0.1}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="size-4 text-primary" /> Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              <InfoRow icon={Mail} label="Email" value={employee.email} />
              <InfoRow icon={Phone} label="Phone" value={employee.phone} />
              <InfoRow icon={MapPin} label="Address" value={employee.address} />
              <InfoRow
                icon={Briefcase}
                label="Gender"
                value={employee.gender ? employee.gender[0].toUpperCase() + employee.gender.slice(1) : ""}
              />
            </CardContent>
          </Card>
        </AnimatedContent>

        {/* Login & security */}
        <AnimatedContent delay={0.15}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4 text-primary" /> Login &amp; security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {login ? (
                <>
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
                    <div>
                      <p className="micro-label text-[10px]">Login status</p>
                      <p className="mt-0.5 text-sm font-medium">
                        {login.is_active ? "Active" : "Disabled"}
                        {login.must_change_password ? (
                          <span className="text-warning"> · temp password pending</span>
                        ) : null}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {login.role}
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={onResetPassword} disabled={resetting}>
                    {resetting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="size-3.5" />
                    )}
                    Reset password (issue temp)
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Is employee ka login account nahi hai (purana record ho sakta hai).
                </p>
              )}
            </CardContent>
          </Card>
        </AnimatedContent>

        {/* Leave balances */}
        <AnimatedContent delay={0.2}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarCheck2 className="size-4 text-primary" /> Leave balance ({new Date().getFullYear()})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leave?.byType?.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 font-medium text-muted-foreground">Type</th>
                      <th className="py-2 text-right font-medium text-muted-foreground">Used</th>
                      <th className="py-2 text-right font-medium text-muted-foreground">Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leave.byType.map((t) => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-2">{t.name}</td>
                        <td className="py-2 text-right tabular">{t.used}</td>
                        <td className="py-2 text-right tabular">{t.remaining}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Abhi koi leave record nahi — Phase 5 me apply/approve live hoga, phir yahan
                  per-type balance dikhega.
                </p>
              )}
            </CardContent>
          </Card>
        </AnimatedContent>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit employee</DialogTitle>
            <DialogDescription>
              Email login identity hai — wo change nahi hoti. Baqi details update karein.
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <form onSubmit={onEditSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="e-name">Full name *</Label>
                  <Input
                    id="e-name"
                    value={form.fullName}
                    onChange={(e) => setField("fullName", e.target.value)}
                    aria-invalid={Boolean(formError)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="e-email">Email (read-only)</Label>
                  <Input id="e-email" value={employee.email} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-phone">Phone</Label>
                  <Input
                    id="e-phone"
                    value={form.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-gender">Gender</Label>
                  <Select value={form.gender || "none"} onValueChange={(v) => setField("gender", v === "none" ? "" : v)}>
                    <SelectTrigger id="e-gender" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-dept">Department</Label>
                  <Select
                    value={form.departmentId || "none"}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        departmentId: v === "none" ? "" : v,
                        designationId: "",
                      }))
                    }
                  >
                    <SelectTrigger id="e-dept" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No department</SelectItem>
                      {deptOptions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-desig">Designation</Label>
                  <Select
                    value={form.designationId || "none"}
                    onValueChange={(v) => setField("designationId", v === "none" ? "" : v)}
                  >
                    <SelectTrigger id="e-desig" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No designation</SelectItem>
                      {desigOptions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-join">Join date *</Label>
                  <Input
                    id="e-join"
                    type="date"
                    value={form.joinDate}
                    onChange={(e) => setField("joinDate", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e-exit">Exit date</Label>
                  <Input
                    id="e-exit"
                    type="date"
                    value={form.exitDate}
                    onChange={(e) => setField("exitDate", e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="e-salary">Basic salary (PKR)</Label>
                  <Input
                    id="e-salary"
                    type="number"
                    min="0"
                    step="1000"
                    value={form.basicSalary}
                    onChange={(e) => setField("basicSalary", e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="e-address">Address</Label>
                  <Textarea
                    id="e-address"
                    rows={2}
                    value={form.address}
                    onChange={(e) => setField("address", e.target.value)}
                  />
                </div>
              </div>
              {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={updating}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updating}>
                  {updating ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save changes
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Status toggle confirm */}
      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(v) => {
          if (!v) setTimeout(() => setStatusTarget(null), 250);
        }}
        title={
          statusTarget === "active"
            ? `Reactivate "${employee.full_name}"?`
            : `Deactivate "${employee.full_name}"?`
        }
        confirmLabel={statusTarget === "active" ? "Reactivate" : "Deactivate"}
        description={
          statusTarget === "active"
            ? "Employee wapas active hoga aur uska login bhi chalu ho jayega."
            : "Employee deactivated hoga aur uska login bhi disable ho jayega. Record delete nahi hoga."
        }
        loading={updating}
        onConfirm={onStatusConfirm}
      />

      {/* Reset password credentials */}
      <TempPasswordDialog
        open={Boolean(credentials)}
        onOpenChange={(v) => {
          if (!v) setCredentials(null);
        }}
        email={credentials?.email}
        tempPassword={credentials?.tempPassword}
        title="Password reset"
      />
    </div>
  );
}
