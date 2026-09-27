"use client";

import { useState } from "react";
import { removeTasks } from "@/app/actions";
import ActionForm, { SubmitButton } from "./ActionForm";

type Item = { id: number; emoji: string; title: string; note: string };

/** Tick several routine items and remove them in one go. */
export default function RemoveManyForm({ items, memberName }: { items: Item[]; memberName: string }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const toggle = (id: number) => {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  };
  const all = picked.size === items.length;
  const count = `${picked.size} item${picked.size === 1 ? "" : "s"}`;

  return (
    <ActionForm
      action={removeTasks}
      confirm={`Remove ${count} from ${memberName}'s routine? Past days keep their scores.`}
      onSuccess={() => setPicked(new Set())}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-muted">Tick the items to remove.</p>
        <button type="button" onClick={() => setPicked(all ? new Set() : new Set(items.map((i) => i.id)))} className="text-sm font-bold text-brand-dark">
          {all ? "Clear" : "Select all"}
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((i) => {
          const on = picked.has(i.id);
          return (
            <li key={i.id}>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 transition ${on ? "border-red-300 bg-red-50" : "border-line bg-white"}`}
              >
                <input type="checkbox" name="ids" value={i.id} checked={on} onChange={() => toggle(i.id)} className="h-5 w-5 shrink-0 accent-red-600" />
                <span className="text-xl">{i.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-bold ${on ? "text-red-700 line-through" : ""}`}>{i.title}</span>
                  <span className="block truncate text-xs text-muted">{i.note}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">Removed items stop from today. Days already done keep their scores and coins.</p>
      {picked.size > 0 && (
        <SubmitButton className="mt-3 w-full rounded-2xl bg-red-600 px-5 py-3 font-bold text-white transition active:scale-[0.98] disabled:opacity-50" pendingText="Removing…">
          🗑️ Remove {count}
        </SubmitButton>
      )}
    </ActionForm>
  );
}
