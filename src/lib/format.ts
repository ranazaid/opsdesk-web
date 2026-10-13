const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 hours ago", "yesterday". Render on the server to avoid hydration drift. */
export function formatRelative(date: Date | string, now: Date = new Date()): string {
  const diff = new Date(date).getTime() - now.getTime();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(date));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(date),
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Human-readable audit log line, e.g. "changed status from open to pending". */
export function describeAuditAction(action: string, metadata: Record<string, unknown>, names: Map<string, string>): string {
  switch (action) {
    case "ticket.created":
      return "created the ticket";
    case "comment.created":
      return "replied to the customer";
    case "comment.internal_note":
      return "added an internal note";
    case "ai.summary":
      return "generated an AI summary";
    case "ai.reply":
      return "drafted a reply with AI";
    case "ticket.updated": {
      const changes = (metadata.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
      const parts = Object.entries(changes).map(([field, { from, to }]) => {
        if (field === "assigneeId") {
          return to ? `assigned it to ${names.get(String(to)) ?? "a teammate"}` : "unassigned it";
        }
        return `changed ${field} from ${String(from)} to ${String(to)}`;
      });
      return parts.join(", ") || "updated the ticket";
    }
    case "member.added":
      return `added ${String(metadata.email ?? "a member")} as ${String(metadata.role ?? "member")}`;
    case "member.role_changed":
      return `changed a member's role from ${String(metadata.from)} to ${String(metadata.to)}`;
    case "member.removed":
      return "removed a member";
    case "billing.plan_changed":
      return `changed the plan from ${String(metadata.from)} to ${String(metadata.to)}`;
    default:
      return action.replace(/[._]/g, " ");
  }
}
