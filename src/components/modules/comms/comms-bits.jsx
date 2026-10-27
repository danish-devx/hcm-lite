import { Badge } from "@/components/ui/badge";

/**
 * Comms & Audit (M9) shared bits — time-ago, action chips, JSON preview.
 */

const GROUP_TONES = {
  "leave.": "border-transparent bg-chart-2/15 text-chart-2",
  "attendance.": "border-transparent bg-chart-3/15 text-chart-3",
  "payroll.": "border-transparent bg-chart-4/15 text-chart-4",
  "announcement.": "border-transparent bg-chart-5/15 text-chart-5",
  "employee.": "border-transparent bg-primary/12 text-primary",
  "user.": "border-transparent bg-primary/12 text-primary",
  "org.": "border-transparent bg-primary/12 text-primary",
  "setup.": "border-transparent bg-primary/12 text-primary",
  "auth.": "border-transparent bg-warning/15 text-warning",
  "ai.": "border-transparent bg-chart-1/15 text-chart-1",
};

export function groupOf(action) {
  return `${String(action ?? "").split(".")[0]}.`;
}

export function groupLabel(group) {
  const g = String(group ?? "").replace(/\.$/, "");
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/** Action chip — group se deterministic warm tone. */
export function ActionChip({ action }) {
  const tone = GROUP_TONES[groupOf(action)] ?? "border-transparent bg-primary/12 text-primary";
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${tone}`}>
      {action}
    </Badge>
  );
}

const AVATAR_TONES = [
  "bg-primary/12 text-primary",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/15 text-chart-5",
];

export function avatarToneFor(name) {
  const str = name ?? "";
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function initialsFor(name) {
  return (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** "just now" / "12m ago" / "3h ago" / "2d ago" / "27 Oct" */
export function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function fullStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Compact role badge for actor rows. */
export function RoleBadge({ role }) {
  if (!role) return null;
  const tone =
    role === "admin"
      ? "border-transparent bg-primary/12 text-primary"
      : role === "hr"
        ? "border-transparent bg-chart-4/15 text-chart-4"
        : "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wide ${tone}`}>
      {role}
    </Badge>
  );
}
