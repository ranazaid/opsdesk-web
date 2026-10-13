import { CreditCard, Inbox, LayoutDashboard, LogOut, Users } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { requireActor } from "@/server/auth/session";
import { NavLink } from "./nav-link";

const PLAN_LABEL = { free: "Free", pro: "Pro", business: "Business" } as const;

export async function SidebarContent() {
  const actor = await requireActor();
  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, visible: true },
    { href: "/tickets", label: "Tickets", icon: Inbox, visible: true },
    { href: "/team", label: "Team & roles", icon: Users, visible: can(actor.role, "member:read") },
    { href: "/billing", label: "Billing", icon: CreditCard, visible: can(actor.role, "billing:read") },
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-1">
        <Logo />
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">Organization</p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-slate-900">{actor.orgName}</p>
          <Badge tone="brand">{PLAN_LABEL[actor.plan]}</Badge>
        </div>
      </div>
      <nav className="mt-5 flex gap-1 lg:flex-col" aria-label="Main">
        {nav
          .filter((item) => item.visible)
          .map(({ href, label, icon: Icon }) => (
            <NavLink key={href} href={href}>
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
      </nav>
      <div className="mt-auto hidden border-t border-slate-200 pt-4 lg:block">
        <div className="flex items-center gap-2.5">
          <Avatar name={actor.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{actor.name}</p>
            <p className="truncate text-xs text-slate-500">{ROLE_LABELS[actor.role]}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Sign out"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy>
      <div className="h-8 w-32 rounded bg-slate-200" />
      <div className="h-14 rounded-lg bg-slate-100" />
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-8 rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
