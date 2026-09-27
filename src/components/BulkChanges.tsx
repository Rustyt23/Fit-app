"use client";

import { useState } from "react";
import { bulkEditTasks, bulkRemoveTasks, saveTask } from "@/app/actions";
import { kindEmoji } from "@/lib/kinds";
import type { Task } from "@/lib/data";
import ActionForm, { SubmitButton } from "./ActionForm";
import AddTaskForm from "./AddTaskForm";
import MemberPicker, { type PickableMember } from "./MemberPicker";
import TaskFields from "./TaskFields";
import type { CustomType } from "./TypeFields";
import type { Lang } from "@/lib/i18n";
import { adminText, type AKey } from "@/lib/i18n-admin";

type Mode = "add" | "edit" | "remove";

const MODES: { value: Mode; key: AKey }[] = [
  { value: "add", key: "bk.add" },
  { value: "edit", key: "bk.change" },
  { value: "remove", key: "bk.remove" },
];

/** Settings that make two people's copies of an item behave differently. */
const SAME_KEYS = ["kind", "time", "days", "any_time", "per_week", "per_month", "repeat_every_days", "month_days", "weight", "coins", "penalty", "details"] as const;

/**
 * Add, change or remove routine items for one person, several or everyone in one go.
 * Items are matched by name, so "Protein shake" means everyone's own copy of it.
 */
export default function BulkChanges({
  members,
  tasks,
  customTypes,
  today,
  lang = "en",
}: {
  members: PickableMember[];
  /** Everyone's current routine items. */
  tasks: Task[];
  customTypes: CustomType[];
  today: string;
  lang?: Lang;
}) {
  const t = adminText(lang);
  const [ids, setIds] = useState<number[]>([]);
  const [mode, setMode] = useState<Mode>("add");
  const [editTitle, setEditTitle] = useState("");
  const [removeTitles, setRemoveTitles] = useState<string[]>([]);

  const name = (id: number) => members.find((m) => m.id === id)?.name ?? "?";
  const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} ${t("bk.and")} ${names.at(-1)}` : (names[0] ?? ""));

  // The picked people's items, grouped by name.
  const groups = new Map<string, { title: string; tasks: Task[] }>();
  for (const t of tasks.filter((t) => ids.includes(t.member_id))) {
    const key = t.title.toLowerCase();
    const g = groups.get(key) ?? { title: t.title, tasks: [] };
    g.tasks.push(t);
    groups.set(key, g);
  }
  const items = [...groups.values()].sort((a, b) => b.tasks.length - a.tasks.length || a.title.localeCompare(b.title));
  const editing = groups.get(editTitle.toLowerCase());
  const differ = editing && editing.tasks.some((t) => SAME_KEYS.some((k) => t[k] !== editing.tasks[0][k]));
  const removing = items.filter((g) => removeTitles.includes(g.title.toLowerCase()));
  const removeCount = removing.reduce((n, g) => n + g.tasks.length, 0);

  const hidden = ids.map((id) => <input key={id} type="hidden" name="member_ids" value={id} />);

  return (
    <div className="space-y-4">
      <div>
        <p className="label">{t("bk.who")}</p>
        <MemberPicker members={members} onChange={(next) => setIds(next.sort((a, b) => a - b))} lang={lang} />
      </div>

      <div>
        <p className="label">{t("bk.what")}</p>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`rounded-xl py-2 text-sm font-extrabold transition ${mode === m.value ? "bg-white text-ink shadow-sm" : "text-muted"}`}
            >
              {t(m.key)}
            </button>
          ))}
        </div>
      </div>

      {!ids.length ? (
        <p className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-muted">{t("bk.pickFirst")}</p>
      ) : mode === "add" ? (
        <AddTaskForm key={ids.join(",")} memberIds={ids} action={saveTask} customTypes={customTypes} today={today} lang={lang} />
      ) : !items.length ? (
        <p className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-muted">{t("bk.noItems", { names: list(ids.map(name)) })}</p>
      ) : mode === "edit" ? (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="bulk-edit-item">
              {t("bk.itemToChange")}
            </label>
            <select id="bulk-edit-item" className="field" value={editing ? editTitle : ""} onChange={(e) => setEditTitle(e.target.value)}>
              <option value="" disabled>
                {t("bk.chooseItem")}
              </option>
              {items.map((g) => (
                <option key={g.title} value={g.title}>
                  {g.title} · {g.tasks.length === 1 ? name(g.tasks[0].member_id) : t("bk.nPeople", { n: g.tasks.length })}
                </option>
              ))}
            </select>
          </div>
          {editing && (
            <ActionForm key={`${editing.title}|${ids.join(",")}`} action={bulkEditTasks}>
              <input type="hidden" name="match_title" value={editing.title} />
              {editing.tasks.map((t) => (
                <input key={t.id} type="hidden" name="member_ids" value={t.member_id} />
              ))}
              <p className="mb-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
                {t("bk.appliesTo", { names: list(editing.tasks.map((x) => name(x.member_id))) })}
                {differ && ` ${t("bk.differ")}`}
              </p>
              <TaskFields values={editing.tasks[0]} customTypes={customTypes} today={today} editing lang={lang} />
              <SubmitButton className="btn mt-4 w-full">
                {t("bk.saveFor", { who: editing.tasks.length === 1 ? name(editing.tasks[0].member_id) : t("bk.nPeople", { n: editing.tasks.length }) })}
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      ) : (
        <ActionForm
          key={ids.join(",")}
          action={bulkRemoveTasks}
          confirm={t("bk.removeQ", { count: removeCount === 1 ? t("rm.oneItem") : t("rm.nItems", { n: removeCount }) })}
          onSuccess={() => setRemoveTitles([])}
        >
          {hidden}
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-muted">{t("bk.tickRemove")}</p>
            <button
              type="button"
              className="shrink-0 text-sm font-bold text-brand-dark"
              onClick={() => setRemoveTitles(removing.length === items.length ? [] : items.map((g) => g.title.toLowerCase()))}
            >
              {removing.length === items.length ? t("af.clear") : t("rm.selectAll")}
            </button>
          </div>
          <ul className="space-y-1.5">
            {items.map((g) => {
              const key = g.title.toLowerCase();
              const on = removeTitles.includes(key);
              return (
                <li key={key}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 transition ${on ? "border-red-300 bg-red-50" : "border-line bg-white"}`}
                  >
                    <input
                      type="checkbox"
                      name="titles"
                      value={g.title}
                      checked={on}
                      onChange={() => setRemoveTitles((cur) => (on ? cur.filter((x) => x !== key) : [...cur, key]))}
                      className="h-5 w-5 shrink-0 accent-red-600"
                    />
                    <span className="text-xl">{kindEmoji(g.tasks[0].kind, g.tasks[0].custom_emoji)}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-bold ${on ? "text-red-700 line-through" : ""}`}>{g.title}</span>
                      <span className="block truncate text-xs text-muted">{list(g.tasks.map((t) => name(t.member_id)))}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">{t("rm.hint")}</p>
          {removeCount > 0 && (
            <SubmitButton
              className="mt-3 w-full rounded-2xl bg-red-600 px-5 py-3 font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
              pendingText={t("m.removing")}
            >
              🗑️ {t("rm.remove", { count: removeCount === 1 ? t("rm.oneItem") : t("rm.nItems", { n: removeCount }) })}
            </SubmitButton>
          )}
        </ActionForm>
      )}
    </div>
  );
}
