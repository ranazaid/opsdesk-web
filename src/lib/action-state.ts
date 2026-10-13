/** Result shape shared by form server actions (consumed via `useActionState`). */
export type ActionState =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | { status: "error"; error: string };

export const idleState: ActionState = { status: "idle" };
