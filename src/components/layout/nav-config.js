import {
  Award,
  Banknote,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Clock,
  Layers,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  Sparkles,
  UserCog,
  Users,
} from "lucide-react";

/**
 * Role-based navigation — brief ke access matrix ke mutabiq.
 * phase =jis build phase me ye module live hoga (P0/P1 ke baad).
 */
export function getNavForRole(role) {
  const main = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, phase: null },
    { label: "AI Assistant", href: "/assistant", icon: Sparkles, phase: null },
  ];

  const admin = [
    {
      label: "Organization",
      href: "/organization/settings",
      icon: Building2,
      phase: null,
      children: [
        { label: "Company Settings", href: "/organization/settings", icon: Settings, phase: null },
        { label: "Departments", href: "/organization/departments", icon: Layers, phase: null },
        { label: "Designations", href: "/organization/designations", icon: Award, phase: null },
        { label: "Leave Types", href: "/organization/leave-types", icon: CalendarRange, phase: null },
        { label: "Holidays", href: "/organization/holidays", icon: CalendarDays, phase: null },
      ],
    },
    { label: "Employees", href: "/employees", icon: Users, phase: null },
    { label: "Users & Logins", href: "/users", icon: UserCog, phase: null },
    { label: "Attendance", href: "/attendance", icon: Clock, phase: null },
    { label: "Leave", href: "/leave", icon: CalendarCheck, phase: null },
    { label: "Payroll", href: "/payroll", icon: Banknote, phase: null },
    { label: "Announcements", href: "/announcements", icon: Megaphone, phase: null },
    { label: "Audit Log", href: "/audit-log", icon: ScrollText, phase: null },
  ];

  const hr = [
    { label: "Employees", href: "/employees", icon: Users, phase: null },
    { label: "Attendance", href: "/attendance", icon: Clock, phase: null },
    { label: "Leave", href: "/leave", icon: CalendarCheck, phase: null },
    { label: "Payroll", href: "/payroll", icon: Banknote, phase: null },
    { label: "Announcements", href: "/announcements", icon: Megaphone, phase: null },
  ];

  const employee = [
    { label: "My Attendance", href: "/attendance", icon: Clock, phase: null },
    { label: "My Leave", href: "/leave", icon: CalendarCheck, phase: null },
    { label: "My Payslips", href: "/payroll", icon: Banknote, phase: null },
    { label: "Announcements", href: "/announcements", icon: Megaphone, phase: null },
  ];

  if (role === "admin") return [...main, ...admin];
  if (role === "hr") return [...main, ...hr];
  return [...main, ...employee];
}

/** Topbar page-title ke liye flat lookup (group children samet kar). */
export function getPageTitle(pathname, role) {
  const items = getNavForRole(role);
  let best = null;
  for (const item of items) {
    const candidates = item.children ? item.children : [item];
    for (const c of candidates) {
      if (
        pathname === c.href ||
        (c.href !== "/dashboard" && pathname.startsWith(c.href))
      ) {
        if (!best || c.href.length > best.href.length) best = c;
      }
    }
  }
  if (!best && pathname === "/profile") return { label: "My Profile" };
  return best ? { label: best.label } : null;
}
