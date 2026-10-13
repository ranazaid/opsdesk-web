import { Avatar } from "@/components/ui/avatar";
import { describeAuditAction, formatRelative } from "@/lib/format";
import type { AuditLogItem } from "@/server/audit";

export function ActivityFeed({
  items,
  names,
  now,
  ticketLinks,
}: {
  items: AuditLogItem[];
  names: Map<string, string>;
  now: Date;
  ticketLinks?: Map<string, { href: string; label: string }>;
}) {
  if (items.length === 0) return <p className="px-5 py-6 text-sm text-slate-500">No activity yet.</p>;
  return (
    <ol className="divide-y divide-slate-100">
      {items.map((item) => {
        const actor = item.actorName ?? "System";
        const link = item.entityId ? ticketLinks?.get(item.entityId) : undefined;
        return (
          <li key={item.id} className="flex gap-3 px-5 py-3">
            <Avatar name={actor} size="sm" />
            <div className="min-w-0 text-sm">
              <p className="text-slate-700">
                <span className="font-medium text-slate-900">{actor}</span>{" "}
                {describeAuditAction(item.action, item.metadata, names)}
                {link ? (
                  <>
                    {" "}
                    on{" "}
                    <a href={link.href} className="font-medium text-brand-700 hover:underline">
                      {link.label}
                    </a>
                  </>
                ) : null}
              </p>
              <p className="text-xs text-slate-400">{formatRelative(item.createdAt, now)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
