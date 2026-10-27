"use client";

import * as React from "react";
import { z } from "zod";
import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Search,
  Upload,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { TempPasswordDialog } from "@/components/modules/employees/temp-password-dialog";
import {
  EmployeeStatusBadge,
  avatarToneFor,
  formatDate,
  initialsFor,
} from "@/components/modules/employees/employee-bits";
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
  useAddEmployeeMutation,
  useGetEmployeesQuery,
} from "@/store/api/employeesApi";
import {
  useGetDepartmentsQuery,
  useGetDesignationsQuery,
} from "@/store/api/organizationApi";

const PAGE_SIZE = 12;

const createFormSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is too short").max(80, "Name is too long"),
  email: z.string().trim().email("Enter a valid email address"),
  joinDate: z.string().min(1, "Join date is required"),
  basicSalary: z.coerce.number().min(0, "Salary cannot be negative"),
});

const EMPTY_FORM = {
  fullName: "",
  email: "",
  phone: "",
  gender: "",
  departmentId: "",
  designationId: "",
  joinDate: format(new Date(), "yyyy-MM-dd"),
  basicSalary: "",
  address: "",
};

export function EmployeesClient() {
  const router = useRouter();

  // ---- Filters (debounced search) ----
  const [searchInput, setSearchInput] = React.useState("");
  const [q, setQ] = React.useState("");
  const [department, setDepartment] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const filters = {
    q,
    department: department === "all" ? "" : department,
    status: status === "all" ? "" : status,
  };

  const { data: employees, isLoading } = useGetEmployeesQuery(filters, {
    // empty data[] default taake pagination math na phate
  });
  const { data: departments } = useGetDepartmentsQuery();
  const { data: designations } = useGetDesignationsQuery();

  const [addEmployee, { isLoading: adding }] = useAddEmployeeMutation();

  // ---- Add dialog state ----
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [error, setError] = React.useState(null);
  const [credentials, setCredentials] = React.useState(null); // { email, tempPassword }

  const rows = employees ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const deptOptions = (departments ?? []).filter((d) => d.is_active);
  const desigOptions = (designations ?? []).filter(
    (d) => !form.departmentId || !d.department_id || d.department_id === form.departmentId
  );

  function openAdd() {
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const parsed = createFormSchema.safeParse({
      fullName: form.fullName,
      email: form.email,
      joinDate: form.joinDate,
      basicSalary: form.basicSalary === "" ? 0 : form.basicSalary,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    try {
      const res = await addEmployee({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        gender: form.gender || "",
        departmentId: form.departmentId || "",
        designationId: form.designationId || "",
        joinDate: form.joinDate,
        basicSalary: form.basicSalary === "" ? 0 : Number(form.basicSalary),
        address: form.address.trim(),
      }).unwrap();
      setDialogOpen(false);
      setCredentials({ email: form.email.trim(), tempPassword: res.data.tempPassword });
      toast.success("Employee registered — login created.");
    } catch (err) {
      setError(getApiError(err));
    }
  }

  function exportCsv() {
    // same-origin fetch → blob download (preview iframe me bhi kaam kare)
    const url = "/api/employees/export";
    fetch(url, { credentials: "same-origin" })
      .then((res) => {
        if (!res.ok) throw new Error("Export failed");
        return res.blob();
      })
      .then((blob) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `employees-${format(new Date(), "yyyy-MM-dd")}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);
      })
      .catch(() => toast.error("Could not export CSV. Please try again."));
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        index="03"
        eyebrow="People"
        title="Employee Directory"
        description="Register karein, search karein, 360 profile kholein — har naye employee ka login automatically banta hai."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
            <Button variant="outline" onClick={() => router.push("/employees/import")}>
              <Upload className="size-4" /> Import CSV
            </Button>
            <Button onClick={openAdd}>
              <Plus className="size-4" /> Add employee
            </Button>
          </>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email ya code (EMP-XXXXXX)…"
            className="pl-9"
            aria-label="Search employees"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={department}
            onValueChange={(v) => {
              setDepartment(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by department">
              <SelectValue />
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
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-36" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="exit">Exited</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="size-6" />
              </div>
              <div>
                <p className="font-medium">
                  {q || department !== "all" || status !== "all"
                    ? "No employees match these filters"
                    : "No employees yet"}
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {q || department !== "all" || status !== "all"
                    ? "Search ya filters clear kar ke dobara try karein."
                    : "Pehla employee register karein — system uska login automatically create karega."}
                </p>
              </div>
              {!q && department === "all" && status === "all" ? (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => router.push("/employees/import")}>
                    <Upload className="size-4" /> Import CSV
                  </Button>
                  <Button onClick={openAdd}>
                    <Plus className="size-4" /> Add employee
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-5 py-3 font-medium text-muted-foreground">Employee</th>
                      <th className="hidden px-5 py-3 font-medium text-muted-foreground md:table-cell">
                        Code
                      </th>
                      <th className="hidden px-5 py-3 font-medium text-muted-foreground lg:table-cell">
                        Department / Designation
                      </th>
                      <th className="hidden px-5 py-3 font-medium text-muted-foreground sm:table-cell">
                        Joined
                      </th>
                      <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/40"
                        onClick={() => router.push(`/employees/${row.id}`)}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarToneFor(row.full_name)}`}
                            >
                              {initialsFor(row.full_name)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{row.full_name}</p>
                              <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-5 py-3 tabular text-muted-foreground md:table-cell">
                          {row.code}
                        </td>
                        <td className="hidden px-5 py-3 lg:table-cell">
                          <p>{row.department_name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.designation_name ?? "No designation"}
                          </p>
                        </td>
                        <td className="hidden px-5 py-3 text-muted-foreground sm:table-cell">
                          {formatDate(row.join_date)}
                        </td>
                        <td className="px-5 py-3">
                          <EmployeeStatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t px-5 py-3">
                <p className="text-xs text-muted-foreground tabular">
                  {rows.length === 0
                    ? "0"
                    : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, rows.length)} of ${rows.length}`}
                </p>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="mr-2 text-[10px] tabular">
                    Page {safePage} / {totalPages}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add employee dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Register employee</DialogTitle>
            <DialogDescription>
              Save karte hi system naya login banayega aur ek temporary password dega — employee
              pehli login par use change karega.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="emp-name">Full name *</Label>
                <Input
                  id="emp-name"
                  placeholder="e.g. Ali Raza"
                  value={form.fullName}
                  onChange={(e) => setField("fullName", e.target.value)}
                  aria-invalid={Boolean(error)}
                  autoFocus
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="emp-email">Email (login) *</Label>
                <Input
                  id="emp-email"
                  type="email"
                  placeholder="ali@company.com"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-phone">Phone</Label>
                <Input
                  id="emp-phone"
                  placeholder="+92 300 1234567"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-gender">Gender</Label>
                <Select value={form.gender} onValueChange={(v) => setField("gender", v)}>
                  <SelectTrigger id="emp-gender" className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-dept">Department</Label>
                <Select
                  value={form.departmentId || "none"}
                  onValueChange={(v) => {
                    setForm((f) => ({
                      ...f,
                      departmentId: v === "none" ? "" : v,
                      designationId: "",
                    }));
                  }}
                >
                  <SelectTrigger id="emp-dept" className="w-full">
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
                <Label htmlFor="emp-desig">Designation</Label>
                <Select
                  value={form.designationId || "none"}
                  onValueChange={(v) => setField("designationId", v === "none" ? "" : v)}
                >
                  <SelectTrigger id="emp-desig" className="w-full">
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
                <Label htmlFor="emp-join">Join date *</Label>
                <Input
                  id="emp-join"
                  type="date"
                  value={form.joinDate}
                  onChange={(e) => setField("joinDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-salary">Basic salary (PKR)</Label>
                <Input
                  id="emp-salary"
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="e.g. 120000"
                  value={form.basicSalary}
                  onChange={(e) => setField("basicSalary", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="emp-address">Address</Label>
                <Textarea
                  id="emp-address"
                  placeholder="Street, area, city"
                  value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={adding}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={adding}>
                {adding ? <Loader2 className="size-4 animate-spin" /> : null}
                Register &amp; create login
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* One-time credentials */}
      <TempPasswordDialog
        open={Boolean(credentials)}
        onOpenChange={(v) => {
          if (!v) setCredentials(null);
        }}
        email={credentials?.email}
        tempPassword={credentials?.tempPassword}
        title="Employee registered"
      />
    </div>
  );
}
