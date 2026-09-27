"use client";

import { createContext, startTransition, useActionState, useContext, type ReactNode } from "react";
import type { FormState } from "@/app/actions";

type Props = {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  /** Ask before submitting (e.g. for deletes). */
  confirm?: string;
  /** Clear the fields after a successful submit (for "add" forms). */
  resetOnSuccess?: boolean;
  /** Called after a successful submit. */
  onSuccess?: () => void;
};

const Pending = createContext(false);

/**
 * Submits through onSubmit rather than the `action` prop so a failed submit
 * keeps what the person typed (React resets `action` forms after every submit).
 */
export default function ActionForm({ action, children, className = "", confirm, resetOnSuccess = false, onSuccess }: Props) {
  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const next = await action(prev, fd);
    if (next?.message && !next.error) onSuccess?.();
    // Keep the last success counter on errors so the form isn't remounted.
    return { ...next, n: next?.n ?? prev?.n };
  }, undefined);

  return (
    <form
      key={resetOnSuccess ? state?.n : undefined}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <Pending.Provider value={pending}>{children}</Pending.Provider>
      {state?.error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {state.error}
        </p>
      )}
      {state?.message && !pending && (
        <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({ children, className = "btn", pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const pending = useContext(Pending);
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
