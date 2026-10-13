"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { uuidSchema } from "@/lib/validators/common";
import { addMemberSchema, changeRoleSchema } from "@/lib/validators/team";
import { toActionError } from "@/server/actions";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { addMember, changeMemberRole, removeMember } from "@/server/team/service";

export async function addMemberAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = addMemberSchema.parse(Object.fromEntries(formData));
    const { temporaryPassword } = await addMember(await getDb(), actor, input);
    revalidatePath("/team");
    return {
      status: "success",
      message: temporaryPassword
        ? `Added ${input.email}. Share this one-time password securely: ${temporaryPassword}`
        : `Added ${input.email} to the organization.`,
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function changeRoleAction(userId: string, _previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const { role } = changeRoleSchema.parse({ role: formData.get("role") });
    await changeMemberRole(await getDb(), actor, uuidSchema.parse(userId), role);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/team");
  return { status: "success", message: "Role updated" };
}

export async function removeMemberAction(userId: string, _previous: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await removeMember(await getDb(), actor, uuidSchema.parse(userId));
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/team");
  return { status: "success", message: "Member removed" };
}
