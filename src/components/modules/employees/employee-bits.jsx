import { Badge } from "@/components/ui/badge";

/** Employee status badge — active (green) / inactive / exit (outline). */
export function EmployeeStatusBadge({ status }) {
  if (status === "active") {
    return (
      <Badge className="border-transparent bg-success/15 text-success hover:bg-success/15">
        Active
      </Badge>
    );
  }
  if (status === "exit") {
    return (
      <Badge variant="outline" className="text-warning border-warning/40">
        Exited
      </Badge>
    );
  }
  return <Badge variant="outline">Inactive</Badge>;
}

/** "Bilal Ahmed" → "BA" — avatar initials. */
export function initialsFor(name) {
  return (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_TONES = [
  "bg-primary/12 text-primary",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/15 text-chart-5",
];

/** Deterministic tone per name — directory me colorful but consistent avatars. */
export function avatarToneFor(name) {
  const str = name ?? "";
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function formatMoney(amount) {
  const n = Number(amount ?? 0);
  return `PKR ${n.toLocaleString("en-PK")}`;
}

export function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
