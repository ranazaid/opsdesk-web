"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/form";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { ROLE_LABELS } from "@/lib/domain";
import { type LoginState, loginAction } from "./actions";

export function LoginForm({ showDemoAccounts }: { showDemoAccounts: boolean }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function fillDemoAccount(email: string) {
    if (emailRef.current) emailRef.current.value = email;
    if (passwordRef.current) passwordRef.current.value = DEMO_PASSWORD;
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.email}
            placeholder="you@agency.com"
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <FormError message={state.error} />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {showDemoAccounts ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-700">Demo accounts</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Seeded locally. Password <code className="font-mono text-slate-700">{DEMO_PASSWORD}</code>. Pick a role
            to see how permissions change the UI.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fillDemoAccount(account.email)}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs hover:border-brand-500 hover:text-brand-700"
              >
                <span className="truncate">{account.name}</span>
                <span className="ml-2 text-slate-400">{ROLE_LABELS[account.role]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
