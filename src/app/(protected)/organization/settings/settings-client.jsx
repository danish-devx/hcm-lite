"use client";

import * as React from "react";
import { z } from "zod";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getApiError } from "@/lib/api-error";
import {
  useGetSettingsQuery,
  useUpdateSettingsMutation,
} from "@/store/api/organizationApi";

const TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Qatar",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "UTC",
  "Europe/London",
  "America/New_York",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const settingsSchema = z.object({
  companyName: z.string().trim().min(2, "Company name is too short").max(80),
  timezone: z.string().min(2),
  officeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM format"),
  graceMinutes: z.coerce.number().int().min(0, "Cannot be negative").max(120),
  halfDayHours: z.coerce.number().min(1, "Minimum 1 hour").max(8, "Maximum 8 hours"),
  weekendDays: z.array(z.number().int().min(0).max(6)).min(1, "Select at least one weekend day"),
  officeLat: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().min(-90, "Invalid latitude").max(90, "Invalid latitude").nullable()
  ),
  officeLng: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().min(-180, "Invalid longitude").max(180, "Invalid longitude").nullable()
  ),
  radiusM: z.coerce.number().int().min(30, "Minimum 30 meters").max(2000),
});

export function SettingsClient() {
  const { data: settings, isLoading, isError } = useGetSettingsQuery();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <PageHeader index="01" eyebrow="Organization" title="Company Settings" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !settings) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <PageHeader index="01" eyebrow="Organization" title="Company Settings" />
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            Settings load nahi ho sakein — page refresh karein.
          </CardContent>
        </Card>
      </div>
    );
  }

  return <SettingsForm settings={settings} />;
}

/**
 * Form tabhi mount hota hai jab settings load ho chuki hoti hain —
 * is liye useState initializer hi hydration karta hai, effect ki zaroorat nahi.
 */
function SettingsForm({ settings }) {
  const [updateSettings, { isLoading: saving }] = useUpdateSettingsMutation();

  const [form, setForm] = React.useState(() => ({
    companyName: settings.companyName ?? "",
    timezone: settings.timezone ?? "Asia/Karachi",
    officeStart: settings.officeStart ?? "09:00",
    graceMinutes: String(settings.graceMinutes ?? 15),
    halfDayHours: String(settings.halfDayHours ?? 5),
    weekendDays: settings.weekendDays ?? [0, 6],
    officeLat: settings.officeLat != null ? String(settings.officeLat) : "",
    officeLng: settings.officeLng != null ? String(settings.officeLng) : "",
    radiusM: String(settings.radiusM ?? 150),
  }));
  const [errors, setErrors] = React.useState({});

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleDay = (day) => {
    setForm((f) => ({
      ...f,
      weekendDays: f.weekendDays.includes(day)
        ? f.weekendDays.filter((d) => d !== day)
        : [...f.weekendDays, day].sort(),
    }));
  };

  async function onSave(e) {
    e?.preventDefault?.();
    const parsed = settingsSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path[0]] = issue.message;
      setErrors(fieldErrors);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setErrors({});

    try {
      await updateSettings(parsed.data).unwrap();
      toast.success("Company settings saved.");
    } catch (err) {
      toast.error(getApiError(err, "Could not save settings."));
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        index="01"
        eyebrow="Organization"
        title="Company Settings"
        description="Company profile, attendance rules aur office location — poori app inhi rules par chalegi."
        actions={
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save changes
          </Button>
        }
      />

      <form onSubmit={onSave} className="space-y-4">
        {/* Company profile */}
        <Card>
          <CardHeader>
            <CardTitle>Company profile</CardTitle>
            <CardDescription>Login page, dashboards aur payslips me yehi naam dikhega.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company name</Label>
              <Input
                id="companyName"
                value={form.companyName}
                onChange={set("companyName")}
                aria-invalid={Boolean(errors.companyName)}
              />
              {errors.companyName ? (
                <p className="text-xs text-destructive">{errors.companyName}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select
                value={form.timezone}
                onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
              >
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
          </CardContent>
        </Card>

        {/* Attendance rules */}
        <Card>
          <CardHeader>
            <CardTitle>Attendance rules</CardTitle>
            <CardDescription>
              Office start ke baad grace period khatam hone par late mark hoga; kam hours par half day.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="officeStart">Office start</Label>
              <Input
                id="officeStart"
                type="time"
                value={form.officeStart}
                onChange={set("officeStart")}
                aria-invalid={Boolean(errors.officeStart)}
              />
              {errors.officeStart ? (
                <p className="text-xs text-destructive">{errors.officeStart}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="graceMinutes">Grace (minutes)</Label>
              <Input
                id="graceMinutes"
                type="number"
                min="0"
                max="120"
                value={form.graceMinutes}
                onChange={set("graceMinutes")}
                aria-invalid={Boolean(errors.graceMinutes)}
              />
              {errors.graceMinutes ? (
                <p className="text-xs text-destructive">{errors.graceMinutes}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="halfDayHours">Half day (hours)</Label>
              <Input
                id="halfDayHours"
                type="number"
                min="1"
                max="8"
                step="0.5"
                value={form.halfDayHours}
                onChange={set("halfDayHours")}
                aria-invalid={Boolean(errors.halfDayHours)}
              />
              {errors.halfDayHours ? (
                <p className="text-xs text-destructive">{errors.halfDayHours}</p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-3">
              <Label>Weekend days</Label>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, index) => {
                  const active = form.weekendDays.includes(index);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleDay(index)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {errors.weekendDays ? (
                <p className="text-xs text-destructive">{errors.weekendDays}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Geofence */}
        <Card>
          <CardHeader>
            <CardTitle>Office location (geofence)</CardTitle>
            <CardDescription>
              Phase 4 ki GPS attendance in coordinates se check karegi. Abhi ke liye optional.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="officeLat">Latitude</Label>
              <Input
                id="officeLat"
                type="number"
                step="any"
                placeholder="24.8607"
                value={form.officeLat}
                onChange={set("officeLat")}
                aria-invalid={Boolean(errors.officeLat)}
              />
              {errors.officeLat ? (
                <p className="text-xs text-destructive">{errors.officeLat}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="officeLng">Longitude</Label>
              <Input
                id="officeLng"
                type="number"
                step="any"
                placeholder="67.0011"
                value={form.officeLng}
                onChange={set("officeLng")}
                aria-invalid={Boolean(errors.officeLng)}
              />
              {errors.officeLng ? (
                <p className="text-xs text-destructive">{errors.officeLng}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="radiusM">Radius (meters)</Label>
              <Input
                id="radiusM"
                type="number"
                min="30"
                max="2000"
                value={form.radiusM}
                onChange={set("radiusM")}
                aria-invalid={Boolean(errors.radiusM)}
              />
              {errors.radiusM ? (
                <p className="text-xs text-destructive">{errors.radiusM}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Separator className="opacity-60" />

        <div className="flex justify-end gap-2 pb-2">
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
