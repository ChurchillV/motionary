"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="mx-auto mt-24 max-w-[340px] rounded-xl bg-canvas p-6">
      <h1 className="text-xl font-semibold">GIF curation</h1>
      <label htmlFor="password" className="mt-4 block text-sm text-ink-2">Admin password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoFocus
        required
        className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2.5 outline-none focus:border-blue"
      />
      {error && <p className="mt-2 text-sm text-amber-ink">{error}</p>}
      <button disabled={pending} className="mt-4 h-11 w-full rounded-[14px] bg-ink font-semibold text-white disabled:opacity-60">
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
