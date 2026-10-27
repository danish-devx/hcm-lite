"use client";

import * as React from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { TempPasswordDialog } from "@/components/modules/employees/temp-password-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getApiError } from "@/lib/api-error";
import { EMPLOYEE_CSV_HEADERS, employeeCsvTemplate } from "@/lib/csv";
import { useImportEmployeesMutation } from "@/store/api/employeesApi";

/**
 * CSV Import wizard — F05:
 * Step 1 Upload (file ya paste) → Step 2 Dry-run review (errors wali rows highlight)
 * → Step 3 Commit result (created logins + one-time temp passwords)
 */
export function ImportClient() {
  const [importEmployees, { isLoading }] = useImportEmployeesMutation();

  const [step, setStep] = React.useState(1); // 1 upload, 2 review, 3 done
  const [fileName, setFileName] = React.useState("");
  const [csvText, setCsvText] = React.useState("");
  const [review, setReview] = React.useState(null); // dry_run response data
  const [result, setResult] = React.useState(null); // commit response data
  const [credentials, setCredentials] = React.useState(null); // pehla created account ka dialog
  const [error, setError] = React.useState(null);

  const fileInputRef = React.useRef(null);

  function downloadTemplate() {
    const blob = new Blob([employeeCsvTemplate()], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "employee-import-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("File is too large (max 2MB).");
      return;
    }
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.onerror = () => setError("File read nahi ho saki — dobara try karein.");
    reader.readAsText(file);
  }

  async function runDryRun() {
    if (!csvText.trim()) {
      setError("Pehle CSV upload karein ya paste karein.");
      return;
    }
    setError(null);
    try {
      const res = await importEmployees({ mode: "dry_run", csv: csvText }).unwrap();
      setReview(res.data);
      setStep(2);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  async function runCommit() {
    setError(null);
    try {
      const res = await importEmployees({ mode: "commit", csv: csvText }).unwrap();
      setResult(res.data);
      setStep(3);
      if (res.data.created > 0) toast.success(`${res.data.created} employees imported.`);
      else toast.error("Koi employee import nahi hui — errors dekhein.");
    } catch (err) {
      setError(getApiError(err));
    }
  }

  function reset() {
    setStep(1);
    setFileName("");
    setCsvText("");
    setReview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        index="03"
        eyebrow="People"
        title="Import Employees"
        description="CSV upload karein — pehle dry-run report dekhein, phir commit. Har valid row ka login automatically banta hai."
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href="/employees">
                <ArrowLeft className="size-4" /> Directory
              </Link>
            </Button>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="size-4" /> Template
            </Button>
          </>
        }
      />

      {/* Stepper */}
      <div className="mb-5 flex items-center gap-2 text-xs">
        {["Upload", "Dry-run review", "Result"].map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <React.Fragment key={label}>
              {i > 0 ? <span className="h-px flex-1 bg-border" /> : null}
              <span
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : done
                      ? "border-success/40 bg-success/10 text-success"
                      : "text-muted-foreground"
                }`}
              >
                <span className="tabular font-semibold">{done ? "✓" : n}</span>
                {label}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1 — Upload */}
      {step === 1 ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border py-10 text-center transition-colors hover:border-primary/50 hover:bg-accent/30"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileSpreadsheet className="size-6" />
              </span>
              <span className="text-sm font-medium">
                {fileName || "Click to choose a CSV file"}
              </span>
              <span className="text-xs text-muted-foreground">
                Columns: {EMPLOYEE_CSV_HEADERS.join(", ")}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onFileChange}
              aria-label="Choose CSV file"
            />

            <div className="space-y-2">
              <p className="micro-label text-[10px]">…ya CSV yahan paste karein</p>
              <Textarea
                rows={7}
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  setFileName(e.target.value ? "pasted.csv" : "");
                }}
                className="font-mono text-xs"
                placeholder={"full_name,email,phone,gender,department,designation,join_date,basic_salary,address\nAli Raza,ali@company.com,,male,Engineering,Senior Software Engineer,2026-01-15,150000,Karachi"}
              />
            </div>

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCsvText(employeeCsvTemplate());
                  setFileName("employee-import-template.csv");
                }}
              >
                Fill with sample
              </Button>
              <Button onClick={runDryRun} disabled={isLoading || !csvText.trim()}>
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                Run dry-run
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 2 — Dry-run review */}
      {step === 2 && review ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="border-transparent bg-success/15 text-success hover:bg-success/15">
                {review.validCount} valid
              </Badge>
              <Badge
                variant="outline"
                className={review.errorCount > 0 ? "border-destructive/40 text-destructive" : ""}
              >
                {review.errorCount} with errors
              </Badge>
              <span className="text-xs text-muted-foreground">
                {review.total} rows parsed — kuch bhi create nahi hua abhi.
              </span>
            </div>

            {review.errors.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Row</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.errors.map((e) => (
                      <tr key={`${e.row}-${e.email}`} className="border-b last:border-0">
                        <td className="px-4 py-2.5 tabular">{e.row}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{e.name}</p>
                          <p className="text-xs text-muted-foreground">{e.email}</p>
                        </td>
                        <td className="px-4 py-2.5 text-destructive">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" /> Sab rows valid hain — commit kar ke logins
                banayen.
              </p>
            )}

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={reset}>
                <Upload className="size-4" /> Change file
              </Button>
              <Button onClick={runCommit} disabled={isLoading || review.validCount === 0}>
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                Import {review.validCount} employee{review.validCount === 1 ? "" : "s"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 3 — Result */}
      {step === 3 && result ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-success/5 px-4 py-3">
                <p className="micro-label text-[10px]">Created</p>
                <p className="font-display text-2xl font-medium tabular text-success">
                  {result.created}
                </p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="micro-label text-[10px]">Failed</p>
                <p className="font-display text-2xl font-medium tabular">{result.failedCount}</p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="micro-label text-[10px]">Total rows</p>
                <p className="font-display text-2xl font-medium tabular">{result.total}</p>
              </div>
            </div>

            {result.accounts.length > 0 ? (
              <div className="space-y-2">
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  Temporary passwords neeche hain — copy kar ke securely share karein. Ye list
                  page chhodne ke baad nahi dikhegi.
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="px-4 py-2.5 font-medium text-muted-foreground">Code</th>
                        <th className="px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
                        <th className="px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                        <th className="px-4 py-2.5 font-medium text-muted-foreground">Temp password</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.accounts.map((a) => (
                        <tr key={a.email} className="border-b last:border-0">
                          <td className="px-4 py-2.5 tabular">{a.code}</td>
                          <td className="px-4 py-2.5 font-medium">{a.name}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{a.email}</td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              className="font-mono text-xs font-semibold text-primary underline-offset-2 hover:underline"
                              onClick={() => {
                                setCredentials({ email: a.email, tempPassword: a.tempPassword });
                              }}
                            >
                              {a.tempPassword}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {result.failed.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-destructive/30">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
                      <th className="px-4 py-2.5 font-medium text-muted-foreground">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.failed.map((f) => (
                      <tr key={`${f.row}-${f.email}`} className="border-b last:border-0">
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{f.name}</p>
                          <p className="text-xs text-muted-foreground">{f.email}</p>
                        </td>
                        <td className="px-4 py-2.5 text-destructive">{f.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                <Upload className="size-4" /> Import more
              </Button>
              <Button asChild>
                <Link href="/employees">View directory</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Click a password → full credential dialog */}
      <TempPasswordDialog
        open={Boolean(credentials)}
        onOpenChange={(v) => {
          if (!v) setCredentials(null);
        }}
        email={credentials?.email}
        tempPassword={credentials?.tempPassword}
        title="Imported login"
      />
    </div>
  );
}
