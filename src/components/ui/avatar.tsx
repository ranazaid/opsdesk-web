import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

const palette = ["bg-indigo-100 text-indigo-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-800", "bg-sky-100 text-sky-700", "bg-rose-100 text-rose-700", "bg-violet-100 text-violet-700"];

function hash(value: string): number {
  let h = 0;
  for (const char of value) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold",
        size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs",
        palette[hash(name) % palette.length],
      )}
    >
      {initials(name)}
    </span>
  );
}
