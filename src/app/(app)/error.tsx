"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto size-8 text-amber-500" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-1 text-sm text-slate-500">
          The error has been logged{error.digest ? ` (reference ${error.digest})` : ""}. Try again, or go back to the
          dashboard.
        </p>
        <Button className="mt-5" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
