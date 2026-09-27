"use client";

import { useState } from "react";
import type { Member } from "@/lib/data";
import Avatar from "./Avatar";

export type PickableMember = Pick<Member, "id" | "name" | "color" | "has_photo" | "photo_version">;

/** Tap photos to choose people (sent as `member_ids`), with a one-tap "Everyone". */
export default function MemberPicker({
  members,
  selected: initial = [],
  onChange,
}: {
  members: PickableMember[];
  selected?: number[];
  onChange?: (count: number) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(initial));
  const update = (next: Set<number>) => {
    setSelected(next);
    onChange?.(next.size);
  };
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    update(next);
  };
  const everyone = members.length > 1 && selected.size === members.length;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {members.map((m) => {
          const on = selected.has(m.id);
          return (
            <label key={m.id} className="flex w-16 cursor-pointer flex-col items-center gap-1 text-center">
              <input type="checkbox" name="member_ids" value={m.id} checked={on} onChange={() => toggle(m.id)} className="sr-only" />
              <span className="relative">
                <Avatar member={m} size={48} className={on ? "" : "opacity-40 grayscale"} ring={on ? "#f97316" : undefined} />
                {on && (
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] font-black text-white ring-2 ring-white">
                    ✓
                  </span>
                )}
              </span>
              <span className={`w-full truncate text-xs font-bold ${on ? "text-ink" : "text-muted"}`}>{m.name}</span>
            </label>
          );
        })}
      </div>
      {members.length > 1 && (
        <button
          type="button"
          onClick={() => update(everyone ? new Set() : new Set(members.map((m) => m.id)))}
          className="mt-2 rounded-full border border-line bg-white px-3 py-1 text-sm font-bold text-muted"
        >
          {everyone ? "Clear" : "👨‍👩‍👧 Everyone"}
        </button>
      )}
    </div>
  );
}
