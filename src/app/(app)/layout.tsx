import { type ReactNode, Suspense } from "react";
import { SidebarContent, SidebarSkeleton } from "@/components/shell/sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-r lg:border-b-0">
        <Suspense fallback={<SidebarSkeleton />}>
          <SidebarContent />
        </Suspense>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
