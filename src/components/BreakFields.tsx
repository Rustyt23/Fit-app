"use client";

import { useState } from "react";
import { addDays, formatDate } from "@/lib/dates";
import { translator, type Lang } from "@/lib/i18n";

const chip =
  "flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-white py-2.5 text-sm font-bold text-muted transition has-[:checked]:border-brand has-[:checked]:bg-orange-50 has-[:checked]:text-brand-dark";

const REASONS = [
  { value: "sick", emoji: "🤒", key: "reason.sick" },
  { value: "travel", emoji: "✈️", key: "reason.travel" },
] as const;

type Length = "1" | "3" | "7" | "pick";
type Start = "today" | "yesterday" | "pick";

/**
 * Inputs for starting a break: tap a reason and how long. `backdate` (admins setting
 * someone else's break) also lets the break start yesterday or on any earlier day.
 * `today` comes from the server so it's the family's date (IST), not the phone's.
 */
export default function BreakFields({
  today,
  memberId,
  backdate = false,
  lang = "en",
}: {
  today: string;
  memberId?: number;
  backdate?: boolean;
  lang?: Lang;
}) {
  const t = translator(lang);
  const [start, setStart] = useState<Start>("today");
  const [pickedFrom, setPickedFrom] = useState(addDays(today, -1));
  const [length, setLength] = useState<Length>("1");
  const [pickedTo, setPickedTo] = useState(addDays(today, 2));

  const from = start === "today" ? today : start === "yesterday" ? addDays(today, -1) : pickedFrom;
  const to = length === "pick" ? pickedTo : addDays(from, Number(length) - 1);
  const short = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short" }, lang);
  const uid = memberId ?? "me";

  return (
    <div className="space-y-4">
      {memberId && <input type="hidden" name="member_id" value={memberId} />}
      <input type="hidden" name="from" value={from} />
      {length !== "pick" && <input type="hidden" name="to" value={to} />}

      <div className="grid grid-cols-2 gap-2">
        {REASONS.map((r, i) => (
          <label key={r.value} className={chip}>
            <input type="radio" name="reason" value={r.value} defaultChecked={i === 0} className="sr-only" />
            <span className="text-lg">{r.emoji}</span> {t(r.key)}
          </label>
        ))}
      </div>

      {backdate && (
        <fieldset>
          <legend className="label">{t("break.starting")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["today", "lb.today"],
                ["yesterday", "break.yesterday"],
                ["pick", "break.otherDay"],
              ] as const
            ).map(([v, key]) => (
              <label key={v} className={chip}>
                <input type="radio" checked={start === v} onChange={() => setStart(v)} className="sr-only" />
                {t(key)}
              </label>
            ))}
          </div>
          {start === "pick" && (
            <input
              type="date"
              aria-label={t("break.from")}
              className="field mt-2"
              value={pickedFrom}
              max={today}
              onChange={(e) => setPickedFrom(e.target.value)}
            />
          )}
        </fieldset>
      )}

      <fieldset>
        <legend className="label">{t("break.howLong")}</legend>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ["1", t("break.oneDay")],
              ["3", t("break.days", { n: 3 })],
              ["7", t("break.week")],
              ["pick", t("break.pickDate")],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className={chip}>
              <input type="radio" checked={length === v} onChange={() => setLength(v)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {length === "pick" && (
          <input
            id={`to-${uid}`}
            name="to"
            type="date"
            aria-label={t("break.to")}
            className="field mt-2"
            value={pickedTo}
            min={from}
            max={backdate ? undefined : addDays(today, 30)}
            onChange={(e) => setPickedTo(e.target.value)}
            required
          />
        )}
      </fieldset>

      <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm font-bold">
        🗓️ {from === to ? short(from) : `${short(from)} – ${short(to)}`}
      </p>
    </div>
  );
}
