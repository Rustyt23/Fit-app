"use client";

import { useState } from "react";
import { KINDS, type Kind } from "@/lib/kinds";
import type { Lang } from "@/lib/i18n";
import { adminText } from "@/lib/i18n-admin";

export type CustomType = { name: string; emoji: string };

const chip =
  "flex cursor-pointer items-center justify-center rounded-xl border border-line bg-white font-bold text-muted transition has-[:checked]:border-brand has-[:checked]:bg-orange-50 has-[:checked]:text-brand-dark";

const EMOJI_CHOICES = ["✨", "🧘", "💧", "📖", "😴", "🥗", "🩸", "🦷", "🌿", "🎵", "🙏", "🚭"];

/** Type: exercise, supplement, medicine, or the family's own (with a name and emoji of their choosing). */
export default function TypeFields({
  uid,
  kind: initialKind,
  customType,
  customEmoji,
  existing = [],
  lang = "en",
}: {
  uid: string;
  kind: Kind;
  customType?: string | null;
  customEmoji?: string | null;
  /** Own types already used in the family, offered as quick picks. */
  existing?: CustomType[];
  lang?: Lang;
}) {
  const t = adminText(lang);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [name, setName] = useState(customType ?? "");
  const [emoji, setEmoji] = useState(customEmoji ?? "✨");

  return (
    <fieldset>
      <legend className="label">{t("ty.type")}</legend>
      <div className="grid grid-cols-4 gap-2">
        {KINDS.map((k) => (
          <label key={k.value} className={`${chip} flex-col gap-0.5 py-2 text-xs`}>
            <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
            <span className="text-2xl">{k.value === "other" && name ? emoji : k.emoji}</span>
            {k.value === "other" && name ? name : t(`ty.${k.value}`)}
          </label>
        ))}
      </div>

      {kind === "other" && (
        <div className="mt-3 space-y-3 rounded-2xl bg-stone-50 p-3">
          {existing.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {existing.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    setName(c.name);
                    setEmoji(c.emoji);
                  }}
                  className={`rounded-full border px-3 py-1 text-sm font-bold ${name === c.name ? "border-brand bg-orange-50 text-brand-dark" : "border-line bg-white"}`}
                >
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-[4rem_1fr] gap-2">
            <input
              name="custom_emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={8}
              aria-label={t("admin.emoji")}
              className="field px-2 text-center text-xl"
            />
            <input
              id={`${uid}-custom-type`}
              name="custom_type"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              required
              placeholder={t("ty.namePlaceholder")}
              aria-label={t("ty.other")}
              className="field"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`grid h-9 w-9 place-items-center rounded-xl text-lg ${emoji === e ? "bg-orange-100" : "bg-white"}`}
                aria-label={`Use ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted">{t("ty.hint")}</p>
        </div>
      )}
    </fieldset>
  );
}
