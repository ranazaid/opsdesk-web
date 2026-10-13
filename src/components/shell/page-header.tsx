import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 lg:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="space-y-6 px-6 py-6 lg:px-8">{children}</div>;
}

export function PageSkeleton() {
  return (
    <div aria-busy className="animate-pulse">
      <div className="border-b border-slate-200 bg-white px-6 py-5 lg:px-8">
        <div className="h-6 w-48 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-72 rounded bg-slate-100" />
      </div>
      <div className="space-y-4 px-6 py-6 lg:px-8">
        <div className="h-28 rounded-xl bg-slate-100" />
        <div className="h-64 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}
