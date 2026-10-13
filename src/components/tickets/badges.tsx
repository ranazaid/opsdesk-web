import { ArrowDown, ArrowRight, ArrowUp, Flame } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PRIORITY_LABELS, STATUS_LABELS, type TicketPriority, type TicketStatus } from "@/lib/domain";

const statusTone: Record<TicketStatus, BadgeTone> = {
  open: "sky",
  pending: "amber",
  resolved: "green",
  closed: "slate",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge tone={statusTone[status]}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const priorityStyle: Record<TicketPriority, { icon: typeof ArrowUp; className: string }> = {
  low: { icon: ArrowDown, className: "text-slate-500" },
  normal: { icon: ArrowRight, className: "text-slate-600" },
  high: { icon: ArrowUp, className: "text-amber-600" },
  urgent: { icon: Flame, className: "text-rose-600 font-medium" },
};

export function PriorityLabel({ priority }: { priority: TicketPriority }) {
  const { icon: Icon, className } = priorityStyle[priority];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${className}`}>
      <Icon className="size-3.5" aria-hidden />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
