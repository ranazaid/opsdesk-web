import type { Metadata } from "next";
import { Suspense } from "react";
import { Check, Minus } from "lucide-react";
import { PageBody, PageHeader, PageSkeleton } from "@/components/shell/page-header";
import { AddMemberForm } from "@/components/team/add-member-form";
import { MemberRoleForm, RemoveMemberButton } from "@/components/team/member-controls";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { ROLE_LABELS, ROLES } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { can, canAssignRole, PERMISSIONS } from "@/lib/permissions";
import { entitlementsFor } from "@/lib/plans";
import { requireActor } from "@/server/auth/session";
import { getUsage } from "@/server/billing/entitlements";
import { getDb } from "@/server/db/client";
import { ForbiddenError } from "@/server/errors";
import { listMembers } from "@/server/team/service";

export const metadata: Metadata = { title: "Team & roles" };

export default function TeamPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  const actor = await requireActor();
  if (!can(actor.role, "member:read")) throw new ForbiddenError();
  const db = await getDb();
  const [members, usage] = await Promise.all([listMembers(db, actor), getUsage(db, actor.orgId)]);
  const { seats } = entitlementsFor(actor.plan);
  const invitable = ROLES.filter((role) => canAssignRole(actor.role, "viewer", role));

  return (
    <>
      <PageHeader title="Team & roles" description="Manage who can access this organization and what they can do." />
      <PageBody>
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader
              title="Members"
              description={`${members.length} people in ${actor.orgName}`}
              action={<div className="w-56"><Meter label="Seats" used={usage.seatsUsed} limit={seats} /></div>}
            />
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium">Member</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Role</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Joined</th>
                    <th scope="col" className="px-5 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((member) => {
                    const isSelf = member.userId === actor.userId;
                    const assignable = ROLES.filter((role) => canAssignRole(actor.role, member.role, role));
                    const manageable = !isSelf && assignable.length > 1;
                    return (
                      <tr key={member.userId}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={member.name} />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">
                                {member.name} {isSelf ? <span className="font-normal text-slate-400">(you)</span> : null}
                              </p>
                              <p className="truncate text-xs text-slate-500">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {manageable ? (
                            <MemberRoleForm userId={member.userId} role={member.role} assignable={assignable} />
                          ) : (
                            <Badge tone={member.role === "owner" ? "violet" : member.role === "admin" ? "brand" : "slate"}>
                              {ROLE_LABELS[member.role]}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap text-slate-500">{formatDate(member.joinedAt)}</td>
                        <td className="px-5 py-3 text-right">
                          {manageable && can(actor.role, "member:remove") ? (
                            <RemoveMemberButton userId={member.userId} name={member.name} />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-6">
            {can(actor.role, "member:invite") ? (
              <Card>
                <CardHeader title="Add a member" description="New members count towards your plan's seats." />
                <AddMemberForm assignable={invitable} seatsFull={usage.seatsUsed >= seats} />
              </Card>
            ) : (
              <Card className="p-5 text-sm text-slate-500">
                Only owners and admins can add members or change roles.
              </Card>
            )}
          </div>
        </div>

        <Card>
          <CardHeader
            title="Roles & permissions"
            description="The central RBAC matrix enforced by every server action and API route."
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="border-b border-slate-100 text-left text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">Permission</th>
                  {ROLES.map((role) => (
                    <th key={role} scope="col" className="px-3 py-2.5 text-center font-medium">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PERMISSIONS.map((permission) => (
                  <tr key={permission}>
                    <th scope="row" className="px-5 py-2 text-left font-mono font-normal text-slate-700">
                      {permission}
                    </th>
                    {ROLES.map((role) => (
                      <td key={role} className="px-3 py-2 text-center">
                        {can(role, permission) ? (
                          <Check className="mx-auto size-4 text-emerald-600" aria-label="Allowed" />
                        ) : (
                          <Minus className="mx-auto size-4 text-slate-300" aria-label="Not allowed" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
