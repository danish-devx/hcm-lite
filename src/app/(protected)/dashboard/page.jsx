import { redirect } from "next/navigation";
import {
  Award,
  Banknote,
  CalendarCheck,
  Clock,
  Megaphone,
  Sparkles,
  Upload,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/guards";
import { todayInTz } from "@/lib/services/attendance.service";
import { DashboardClient } from "@/components/modules/dashboard/dashboard-client";
import { AnimatedContent } from "@/components/react-bits/animated-content";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function greetingFor(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function checklistFor(role) {
  if (role === "admin") {
    return [
      { icon: Award, label: "Create departments, designations, leave types & holidays", href: "/organization/departments" },
      { icon: UserPlus, label: "Register employees — logins auto-create hote hain", href: "/employees" },
      { icon: UserCog, label: "Create HR logins & manage user accounts", href: "/users" },
      { icon: Clock, label: "Watch the live attendance board & approve corrections", href: "/attendance" },
      { icon: CalendarCheck, label: "Approve or reject leave requests from the inbox", href: "/leave" },
      { icon: Banknote, label: "Review the payroll draft — finalize locks the run", href: "/payroll" },
      { icon: Sparkles, label: "Ask Bloom — AI answers from your real data", href: "/assistant" },
    ];
  }
  if (role === "hr") {
    return [
      { icon: Users, label: "Register employees — logins are created automatically", href: "/employees" },
      { icon: Upload, label: "Bulk import employees via CSV (with dry-run report)", href: "/employees/import" },
      { icon: Clock, label: "Daily attendance board — approve correction requests", href: "/attendance" },
      { icon: CalendarCheck, label: "Approve leave requests with a comment", href: "/leave" },
      { icon: Banknote, label: "Create the monthly payroll draft & review items", href: "/payroll" },
      { icon: Sparkles, label: "Summarize the dashboard with one AI click", href: "/dashboard" },
    ];
  }
  return [
    { icon: Clock, label: "Check in and check out daily — right from here", href: "/attendance" },
    { icon: CalendarCheck, label: "Apply for leave and track your balance", href: "/leave" },
    { icon: Award, label: "Download your payslip PDF each month", href: "/payroll" },
    { icon: Sparkles, label: "Smart leave — type “next Monday off”, get a pre-filled form", href: "/assistant" },
    { icon: Megaphone, label: "Read company announcements", href: "/announcements" },
  ];
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { profile, supabase } = session;

  const { data: settings } = await supabase
    .from("hcm_company_settings")
    .select("company_name, timezone")
    .eq("id", 1)
    .maybeSingle();

  const tz = settings?.timezone ?? "Asia/Karachi";
  const today = todayInTz(tz);
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(now)
  );
  const dateStr = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: tz,
  }).format(now);

  const role = profile.role;
  const isStaff = role === "admin" || role === "hr";
  const checklist = checklistFor(role);

  // M9 — live announcements feed (latest 3, RLS: sab authed roles dekh sakte hain)
  const { data: announcements } = await supabase
    .from("hcm_announcements")
    .select("id, title, body, created_at")
    .order("created_at", { ascending: false })
    .limit(3);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Welcome */}
      <AnimatedContent>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-3xl font-medium tracking-tight">
              {greetingFor(hour)}, {profile.full_name.split(" ")[0]} 👋
            </h2>
            <Badge variant="secondary" className="uppercase tracking-wide">
              {role}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {settings?.company_name ?? "Your company"} · {dateStr}
            {isStaff ? " — numbers yahan server se live compute hote hain." : ""}
          </p>
        </div>
      </AnimatedContent>

      {/* M7 analytics — role-aware, filters staff-only */}
      <DashboardClient role={role} today={today} />

      <Separator />

      {/* Quick links */}
      <AnimatedContent delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
            <CardDescription>
              Aap ke role ke agla qadam — dashboards in sab actions se live update hote hain.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 sm:grid-cols-2">
            {checklist.map((item) => {
              const inner = (
                <>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="size-4" />
                  </div>
                  <p className="min-w-0 flex-1 text-sm">{item.label}</p>
                  {item.phase ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Phase {item.phase}
                    </Badge>
                  ) : null}
                </>
              );
              const cls = "flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/60";
              return item.href ? (
                <Link key={item.label} href={item.href} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div key={item.label} className={cls}>
                  {inner}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </AnimatedContent>

      {/* Right column cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AnimatedContent delay={0.15}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="size-4 text-primary" /> Announcements
              </CardTitle>
              <CardDescription>Company-wide updates yahan dikhengi.</CardDescription>
            </CardHeader>
            <CardContent>
              {(announcements ?? []).length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
                  <Megaphone className="size-6 text-muted-foreground/60" />
                  <p className="max-w-44 text-xs text-muted-foreground">
                    Abhi koi announcement nahi — HR/Admin posts karega to yahan dikhegi.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {announcements.map((a) => (
                    <Link
                      key={a.id}
                      href="/announcements"
                      className="block rounded-lg border p-3 transition-colors hover:bg-accent/50"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-medium">{a.title}</p>
                        <span className="shrink-0 text-[10px] whitespace-nowrap text-muted-foreground tabular">
                          {new Date(a.created_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
                    </Link>
                  ))}
                  <Link
                    href="/announcements"
                    className="block text-center text-xs font-medium text-primary hover:underline"
                  >
                    View all announcements
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </AnimatedContent>

        <AnimatedContent delay={0.2}>
          <Card className="relative h-full overflow-hidden border-primary/25">
            <div className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-primary/15 blur-2xl" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> AI Assistant
              </CardTitle>
              <CardDescription>
                &ldquo;Who is on leave today?&rdquo; — plain words me poochein, real data se jawab
                milega.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild size="sm" className="rounded-full">
                <Link href="/assistant">
                  <Sparkles className="size-4" /> Open assistant
                </Link>
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {isStaff
                  ? "Chat tools, dashboard AI summary aur policy Q&A — sab live."
                  : "Chat, smart leave aur policy Q&A — aap ke data par live."}
              </p>
            </CardContent>
          </Card>
        </AnimatedContent>
      </div>

      <AnimatedContent delay={0.25}>
        <p className="text-center text-xs text-muted-foreground">
          Announcements, notifications & audit trail live —{" "}
          <Link href="/assistant" className="underline underline-offset-2">
            ask Bloom
          </Link>
          {" "}ya{" "}
          <Link href="/attendance" className="underline underline-offset-2">
            daily board
          </Link>{" "}
          par real numbers dekhein — sab kuch aap ke apne records se compute hota hai.
        </p>
      </AnimatedContent>
    </div>
  );
}
