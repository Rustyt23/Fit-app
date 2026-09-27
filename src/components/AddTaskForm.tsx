"use client";

import { useState } from "react";
import type { FormState } from "@/app/actions";
import { BLANK_TASK, TEMPLATES, type TaskValues } from "@/lib/templates";
import ActionForm, { SubmitButton } from "./ActionForm";
import MemberPicker, { type PickableMember } from "./MemberPicker";
import TaskFields from "./TaskFields";
import type { CustomType } from "./TypeFields";
import type { Lang } from "@/lib/i18n";
import { adminText } from "@/lib/i18n-admin";

/**
 * "Add to routine": pick a ready-made item with one tap (then adjust), or fill it in from scratch.
 * With `members`, the same item can go to several people at once (each gets their own copy).
 */
export default function AddTaskForm({
  memberId,
  members,
  memberIds,
  action,
  customTypes = [],
  today,
  lang = "en",
}: {
  /** Who it's for to begin with (none on the family-wide form). */
  memberId?: number;
  /** Shows a "Who gets this" picker. */
  members?: PickableMember[];
  /** Or: the people were already picked elsewhere (bulk changes). */
  memberIds?: number[];
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  customTypes?: CustomType[];
  today: string;
  lang?: Lang;
}) {
  const t = adminText(lang);
  const [pickedCount, setPeople] = useState(memberId ? 1 : 0);
  const people = memberIds ? memberIds.length : pickedCount;
  const [values, setValues] = useState<TaskValues>(BLANK_TASK);
  const [picked, setPicked] = useState<string | null>(null);
  // Changing the key remounts the fields with the template's values.
  const [version, setVersion] = useState(0);

  const pick = (t: (typeof TEMPLATES)[number] | null) => {
    setValues(t ?? BLANK_TASK);
    setPicked(t?.title ?? null);
    setVersion((v) => v + 1);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="label">{t("af.quick")}</p>
        <div className="-mx-1 flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => pick(t)}
              className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${
                picked === t.title ? "border-brand bg-orange-50 text-brand-dark" : "border-line bg-white text-ink"
              }`}
            >
              {t.emoji} {t.title}
            </button>
          ))}
          {picked && (
            <button type="button" onClick={() => pick(null)} className="rounded-full px-3 py-1.5 text-sm font-bold text-muted underline">
              {t("af.clear")}
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted">{t("af.quickHint")}</p>
      </div>

      <ActionForm
        action={action}
        resetOnSuccess
        onSuccess={() => {
          pick(null);
          setPeople(memberId ? 1 : 0);
        }}
      >
        {members && members.length > 1 && (
          <fieldset className="mb-4">
            <legend className="label">{t("af.who")}</legend>
            <input type="hidden" name="pick_members" value="1" />
            <MemberPicker members={members} selected={memberId ? [memberId] : []} onChange={(ids) => setPeople(ids.length)} lang={lang} />
            <p className="mt-1.5 text-xs text-muted">{t("af.whoHint")}</p>
          </fieldset>
        )}
        {memberIds && (
          <>
            <input type="hidden" name="pick_members" value="1" />
            {memberIds.map((id) => (
              <input key={id} type="hidden" name="member_ids" value={id} />
            ))}
          </>
        )}
        <TaskFields key={version} memberId={memberId} values={values} customTypes={customTypes} today={today} lang={lang} />
        <SubmitButton className="btn mt-4 w-full" pendingText={t("admin.adding")}>
          {people > 1 ? t("af.addFor", { n: people }) : t("af.add")}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
