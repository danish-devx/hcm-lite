"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { authApi, useGetSetupStatusQuery, useLoginMutation } from "@/store/api/authApi";
import { useDispatch } from "react-redux";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitText } from "@/components/react-bits/split-text";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function LoginPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { data: setup, isLoading: setupLoading } = useGetSetupStatusQuery();
  const [login, { isLoading }] = useLoginMutation();

  const [form, setForm] = React.useState({ email: "", password: "" });
  const [errors, setErrors] = React.useState({});
  const [showPassword, setShowPassword] = React.useState(false);

  // Fresh install → first-run wizard
  React.useEffect(() => {
    if (setup && !setup.setupDone) {
      router.replace("/first-run");
    }
  }, [setup, router]);

  async function onSubmit(e) {
    e.preventDefault();
    const parsed = loginSchema.safeParse(form);
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
      const res = await login(parsed.data).unwrap();
      dispatch(authApi.util.resetApiState());
      toast.success(`Welcome back, ${res.profile.full_name.split(" ")[0]}!`);
      // Proxy redirect ke saath aaya ?next= honor karein (open-redirect safe)
      const nextParam = new URLSearchParams(window.location.search).get("next");
      const target =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
          ? nextParam
          : "/dashboard";
      router.push(res.mustChangePassword ? "/change-password" : target);
    } catch (err) {
      const message = err?.data?.error || "Sign in failed. Please try again.";
      setErrors({ password: message });
      toast.error(message);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-3">
        {setup?.companyName ? (
          <Badge variant="secondary" className="font-medium">
            {setup.companyName}
          </Badge>
        ) : setupLoading ? (
          <Skeleton className="h-5 w-32" />
        ) : null}
        <h1 className="font-display text-4xl font-medium tracking-tight">
          <SplitText text="Welcome back" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in to your {setup?.companyName ?? "company"} HR workspace.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className="pl-9"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              aria-invalid={Boolean(errors.email)}
            />
          </div>
          {errors.email ? (
            <p className="text-xs text-destructive">{errors.email}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
          </div>
          <div className="relative">
            <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              className="px-9"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              aria-invalid={Boolean(errors.password)}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password ? (
            <p className="text-xs text-destructive">{errors.password}</p>
          ) : null}
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Trouble signing in? Admin can reset your login from the{" "}
        <span className="font-medium">Users &amp; Logins</span> panel.
        {" · "}
        <Link href="/" className="underline underline-offset-2">
          Home
        </Link>
      </p>
    </div>
  );
}
