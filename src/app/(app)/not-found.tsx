import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6 text-center">
      <div>
        <p className="text-sm font-medium text-brand-600">404</p>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">We couldn&apos;t find that</h1>
        <p className="mt-1 text-sm text-slate-500">It may have been removed, or it belongs to another organization.</p>
        <Link href="/tickets" className={buttonClasses("secondary", "md", "mt-5")}>
          Back to tickets
        </Link>
      </div>
    </div>
  );
}
