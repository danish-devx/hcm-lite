"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { useGetMeQuery, useChangePasswordMutation } from "@/store/api/authApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/layout/logo";

const passwordRule = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Za-z]/, "Must contain a letter")
  .regex(/[0-9]/, "Must contain a number");

const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordRule,
    confirmPassword: z.string().min(1, "Confirm the password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export default function ChangePasswordPage() {
  const router = useRouter();
  const { data: me, isLoading } = useGetMeQuery();
  const [changePassword, { isSubmitting }] = useChangePasswordMutation();

  const [form, setForm] = React.useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = React.useState({});

  const forced = me?.profile?.must_change_password;

  async function onSubmit(e) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0]] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    try {
      await changePassword({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      }).unwrap();
      toast.success("Password updated successfully!");
      router.replace("/dashboard");
    } catch (err) {
      const message = err?.data?.error || "Password could not be updated.";
      setErrors({ currentPassword: message });
      toast.error(message);
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-6">
      <Logo />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">Change password</h1>
            <p className="text-sm text-muted-foreground">
              {forced
                ? "Aap temporary password use kar rahe hain — continue karne ke liye naya password set karein."
                : "Security ke liye strong password choose karein."}
            </p>
          </div>

          {forced ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Temporary password active — jab tak naya password set nahi hoga, app
              khul nahi jaye ga.
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={set("currentPassword")}
                aria-invalid={Boolean(errors.currentPassword)}
              />
              {errors.currentPassword ? (
                <p className="text-xs text-destructive">{errors.currentPassword}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={form.newPassword}
                onChange={set("newPassword")}
                aria-invalid={Boolean(errors.newPassword)}
              />
              {errors.newPassword ? (
                <p className="text-xs text-destructive">{errors.newPassword}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Min 8 characters — ek letter + ek number
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={set("confirmPassword")}
                aria-invalid={Boolean(errors.confirmPassword)}
              />
              {errors.confirmPassword ? (
                <p className="text-xs text-destructive">{errors.confirmPassword}</p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Updating…
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" /> Update password
                </>
              )}
            </Button>

            {!forced ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => router.push("/dashboard")}
              >
                <ArrowLeft className="size-4" /> Back to dashboard
              </Button>
            ) : null}
          </form>
        </>
      )}
    </div>
  );
}
