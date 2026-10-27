"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  MapPin,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { useGetSetupStatusQuery, useRunSetupMutation } from "@/store/api/authApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/logo";

/* ----------------------------- step schemas ----------------------------- */

const companySchema = z.object({
  companyName: z.string().trim().min(2, "Company name is required"),
  timezone: z.string().min(2),
  officeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
  graceMinutes: z.coerce.number().int().min(0).max(120),
  halfDayHours: z.coerce.number().min(1).max(8),
  weekendDays: z.array(z.number().int().min(0).max(6)),
});

const locationSchema = z.object({
  officeLat: z.number().min(-90).max(90).nullable(),
  officeLng: z.number().min(-180).max(180).nullable(),
  radiusM: z.coerce.number().int().min(30, "Radius at least 30 m").max(2000),
});

const passwordRule = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Za-z]/, "Must contain a letter")
  .regex(/[0-9]/, "Must contain a number");

const adminSchema = z
  .object({
    adminFullName: z.string().trim().min(2, "Full name is required"),
    adminEmail: z.string().trim().email("Enter a valid email"),
    adminPassword: passwordRule,
    confirmPassword: z.string().min(1, "Confirm the password"),
  })
  .refine((d) => d.adminPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

const STEPS = [
  { label: "Company", icon: Building2, schema: companySchema, fields: ["companyName", "timezone", "officeStart", "graceMinutes", "halfDayHours"] },
  { label: "Office Area", icon: MapPin, schema: locationSchema, fields: ["officeLat", "officeLng", "radiusM"] },
  { label: "Admin Account", icon: ShieldCheck, schema: adminSchema, fields: ["adminFullName", "adminEmail", "adminPassword", "confirmPassword"] },
];

const TIMEZONES = ["Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "UTC"];

const INITIAL = {
  companyName: "",
  timezone: "Asia/Karachi",
  officeStart: "09:00",
  graceMinutes: 15,
  halfDayHours: 5,
  weekendDays: [0, 6],
  officeLat: null,
  officeLng: null,
  radiusM: 150,
  adminFullName: "",
  adminEmail: "",
  adminPassword: "",
  confirmPassword: "",
};

function weekendLabel(days) {
  const names = { 0: "Sun", 6: "Sat" };
  const sorted = [...days].sort();
  if (sorted.length === 0) return "No weekend";
  return sorted.map((d) => names[d] ?? d).join(" + ") + " weekend";
}

/* ------------------------------- wizard --------------------------------- */

export default function FirstRunPage() {
  const router = useRouter();
  const { data: setup } = useGetSetupStatusQuery();
  const [runSetup, { isLoading }] = useRunSetupMutation();

  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState(INITIAL);
  const [errors, setErrors] = React.useState({});
  const [done, setDone] = React.useState(false);
  const [locating, setLocating] = React.useState(false);

  React.useEffect(() => {
    if (setup?.setupDone) router.replace("/login");
  }, [setup, router]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  function validateStep(index) {
    const { schema, fields } = STEPS[index];
    const subset = {};
    for (const f of fields) subset[f] = form[f];
    const parsed = schema.safeParse(subset);
    if (!parsed.success) {
      const fieldErrors = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0]] = issue.message;
      }
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  }

  function next() {
    if (validateStep(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  function toggleWeekend(day) {
    set((f) => ({
      weekendDays: form.weekendDays.includes(day)
        ? form.weekendDays.filter((d) => d !== day)
        : [...form.weekendDays, day].sort(),
    }));
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set({
          officeLat: Number(pos.coords.latitude.toFixed(6)),
          officeLng: Number(pos.coords.longitude.toFixed(6)),
        });
        setLocating(false);
        toast.success(
          `Location captured (±${Math.round(pos.coords.accuracy)} m). Aap isay manually bhi adjust kar sakte hain.`
        );
      },
      (err) => {
        setLocating(false);
        toast.error("Location nahi mili: " + err.message + " — manually enter kar dein.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function submit() {
    // Step 2 optional hai (location skip ho sakti hai) — sirf filled values validate
    if (form.officeLat !== null || form.officeLng !== null) {
      if (!validateStep(1)) {
        setStep(1);
        return;
      }
    }
    if (!validateStep(2)) return;

    try {
      await runSetup({
        companyName: form.companyName,
        timezone: form.timezone,
        officeStart: form.officeStart,
        graceMinutes: form.graceMinutes,
        halfDayHours: form.halfDayHours,
        weekendDays: form.weekendDays,
        officeLat: form.officeLat,
        officeLng: form.officeLng,
        radiusM: form.radiusM,
        adminFullName: form.adminFullName,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
      }).unwrap();
      setDone(true);
    } catch (err) {
      const message =
        err?.data?.error ||
        err?.data?.details?.[0]?.message ||
        "Setup could not be completed.";
      toast.error(message);
    }
  }

  /* ------------------------------ success ------------------------------ */

  if (done) {
    return (
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="size-8 text-emerald-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {form.companyName} is ready!
          </h1>
          <p className="text-sm text-muted-foreground">
            Admin account created with <span className="font-medium text-foreground">{form.adminEmail}</span>.
            Sign in karte hi aap departments, leave types aur employees set up kar sakte hain.
          </p>
        </div>
        <Button className="w-full" onClick={() => router.replace("/login")}>
          Go to sign in <ArrowRight className="size-4" />
        </Button>
      </div>
    );
  }

  /* ------------------------------- wizard ------------------------------- */

  const CurrentIcon = STEPS[step].icon;

  return (
    <div className="w-full max-w-md space-y-6">
      <Logo />

      {/* Stepper */}
      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s.label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                i < step && "border-primary bg-primary text-primary-foreground",
                i === step && "border-primary text-primary",
                i > step && "border-border text-muted-foreground"
              )}
            >
              {i < step ? <CheckCircle2 className="size-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs font-medium sm:block",
                i === step ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
          </li>
        ))}
      </ol>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <CurrentIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">{STEPS[step].label}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {step === 0 &&
            "Company profile aur attendance rules — ye rules har record par apply honge."}
          {step === 1 &&
            "Office location camera attendance ke liye use hogi (optional — baad me bhi set kar sakte hain)."}
          {step === 2 &&
            "Ye aap ka Admin login hoga — sari setup aur payroll finalize is se hogi."}
        </p>
      </div>

      {/* STEP 1 — Company */}
      {step === 0 ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company name</Label>
            <Input
              id="companyName"
              placeholder="e.g. Saylani Technologies"
              value={form.companyName}
              onChange={(e) => set({ companyName: e.target.value })}
              aria-invalid={Boolean(errors.companyName)}
            />
            {errors.companyName ? <p className="text-xs text-destructive">{errors.companyName}</p> : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={form.timezone} onValueChange={(v) => set({ timezone: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="officeStart">Office start</Label>
              <Input
                id="officeStart"
                type="time"
                value={form.officeStart}
                onChange={(e) => set({ officeStart: e.target.value })}
                aria-invalid={Boolean(errors.officeStart)}
              />
              {errors.officeStart ? <p className="text-xs text-destructive">{errors.officeStart}</p> : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="graceMinutes">Grace (minutes)</Label>
              <Input
                id="graceMinutes"
                type="number"
                min={0}
                max={120}
                value={form.graceMinutes}
                onChange={(e) => set({ graceMinutes: e.target.value })}
                aria-invalid={Boolean(errors.graceMinutes)}
              />
              <p className="text-[11px] text-muted-foreground">
                Check-in {form.officeStart} + {form.graceMinutes || 0}m ke baad = late
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="halfDayHours">Half day (hours)</Label>
              <Input
                id="halfDayHours"
                type="number"
                min={1}
                max={8}
                step={0.5}
                value={form.halfDayHours}
                onChange={(e) => set({ halfDayHours: e.target.value })}
                aria-invalid={Boolean(errors.halfDayHours)}
              />
              <p className="text-[11px] text-muted-foreground">
                Is se kam kaam = half day
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Weekend days</Label>
            <div className="flex gap-2">
              {[6, 0].map((day) => (
                <Badge
                  key={day}
                  variant={form.weekendDays.includes(day) ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1"
                  onClick={() => toggleWeekend(day)}
                >
                  {day === 6 ? "Saturday" : "Sunday"}
                </Badge>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {weekendLabel(form.weekendDays)} — leave aur payroll calculations me skip hoga
            </p>
          </div>
        </div>
      ) : null}

      {/* STEP 2 — Office area */}
      {step === 1 ? (
        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={useMyLocation}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MapPin className="size-4" />
            )}
            {locating ? "Getting location…" : "Use my current location"}
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lat">Latitude</Label>
              <Input
                id="lat"
                type="number"
                step="any"
                placeholder="24.8607"
                value={form.officeLat ?? ""}
                onChange={(e) =>
                  set({ officeLat: e.target.value === "" ? null : Number(e.target.value) })
                }
                aria-invalid={Boolean(errors.officeLat)}
              />
              {errors.officeLat ? <p className="text-xs text-destructive">{errors.officeLat}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lng">Longitude</Label>
              <Input
                id="lng"
                type="number"
                step="any"
                placeholder="67.0011"
                value={form.officeLng ?? ""}
                onChange={(e) =>
                  set({ officeLng: e.target.value === "" ? null : Number(e.target.value) })
                }
                aria-invalid={Boolean(errors.officeLng)}
              />
              {errors.officeLng ? <p className="text-xs text-destructive">{errors.officeLng}</p> : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="radius">Geofence radius (meters)</Label>
            <Input
              id="radius"
              type="number"
              min={30}
              max={2000}
              value={form.radiusM}
              onChange={(e) => set({ radiusM: e.target.value })}
              aria-invalid={Boolean(errors.radiusM)}
            />
            <p className="text-[11px] text-muted-foreground">
              Camera check-in sirf is radius ke andar accept hoga (default 150 m).
              Location skip karna ho to empty chhor dein.
            </p>
          </div>
        </div>
      ) : null}

      {/* STEP 3 — Admin */}
      {step === 2 ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adminFullName">Full name</Label>
            <Input
              id="adminFullName"
              placeholder="e.g. Ahmed Khan"
              value={form.adminFullName}
              onChange={(e) => set({ adminFullName: e.target.value })}
              aria-invalid={Boolean(errors.adminFullName)}
            />
            {errors.adminFullName ? <p className="text-xs text-destructive">{errors.adminFullName}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminEmail">Admin email</Label>
            <Input
              id="adminEmail"
              type="email"
              autoComplete="username"
              placeholder="admin@company.com"
              value={form.adminEmail}
              onChange={(e) => set({ adminEmail: e.target.value })}
              aria-invalid={Boolean(errors.adminEmail)}
            />
            {errors.adminEmail ? <p className="text-xs text-destructive">{errors.adminEmail}</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adminPassword">Password</Label>
              <Input
                id="adminPassword"
                type="password"
                autoComplete="new-password"
                value={form.adminPassword}
                onChange={(e) => set({ adminPassword: e.target.value })}
                aria-invalid={Boolean(errors.adminPassword)}
              />
              {errors.adminPassword ? <p className="text-xs text-destructive">{errors.adminPassword}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => set({ confirmPassword: e.target.value })}
                aria-invalid={Boolean(errors.confirmPassword)}
              />
              {errors.confirmPassword ? <p className="text-xs text-destructive">{errors.confirmPassword}</p> : null}
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <UserRound className="mt-0.5 size-3.5 shrink-0" />
            Min 8 characters, ek letter + ek number. Ye account first sign-in par
            password change bhi kar sakta hai.
          </p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {step > 0 ? (
          <Button type="button" variant="outline" className="flex-1" onClick={back} disabled={isLoading}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button type="button" className="flex-1" onClick={next}>
            Continue <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button type="button" className="flex-1" onClick={submit} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" /> Complete setup
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
