import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/cn";

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
        <LifeBuoy className="size-4.5" aria-hidden />
      </span>
      <span className={cn("text-base font-semibold tracking-tight", inverted ? "text-white" : "text-slate-900")}>
        OpsDesk
      </span>
    </span>
  );
}
