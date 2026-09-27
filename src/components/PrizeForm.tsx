import { MAX_COINS_PER_RULE, type EventKind, type Prize } from "@/lib/rules";
import { EVENTS } from "@/lib/stats";
import { saveEventPrizes } from "@/app/actions";
import ActionForm, { SubmitButton } from "./ActionForm";
import Coin from "./Coin";
import { THEMES, THEME_EMOJI, type ThemeSetting } from "@/lib/themes";
import { translator } from "@/lib/i18n";

const MEDALS = ["🥇", "🥈", "🥉"];

/** Admin form for one event's prizes: coins, a real-world prize, and whether to keep it a surprise. */
export default function PrizeForm({ kind, prizes, theme }: { kind: EventKind; prizes: Prize[]; theme: ThemeSetting }) {
  const t = translator("en");
  return (
    <ActionForm action={saveEventPrizes} className="space-y-3">
      <input type="hidden" name="event" value={kind} />
      <p className="text-sm font-black">
        {EVENTS[kind].emoji} {EVENTS[kind].label}
      </p>
      <div>
        <label className="label" htmlFor={`theme-${kind}`}>
          Judged on
        </label>
        <select id={`theme-${kind}`} name="theme" className="field" defaultValue={theme}>
          <option value="rotate">🔄 Rotate automatically (a different theme each {EVENTS[kind].short})</option>
          {THEMES.map((th) => (
            <option key={th} value={th}>
              {THEME_EMOJI[th]} {t(`theme.${th}`)}: {t(`theme.${th}.how`).toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      {prizes.map((p, i) => (
        <div key={i} className="rounded-2xl bg-stone-50 p-3">
          <div className="grid grid-cols-[2rem_6rem_1fr] items-center gap-2">
            <span className="text-2xl">{MEDALS[i]}</span>
            <span className="relative block">
              <input
                name={`coins_${i}`}
                type="number"
                min={0}
                max={MAX_COINS_PER_RULE * 10}
                defaultValue={p.coins}
                aria-label={`Coins for place ${i + 1}`}
                className="field py-2 pl-8 pr-2 text-right font-black"
              />
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
                <Coin size={18} />
              </span>
            </span>
            <input
              name={`prize_${i}`}
              defaultValue={p.prize}
              maxLength={80}
              placeholder="Real prize (optional)"
              aria-label={`Prize for place ${i + 1}`}
              className="field py-2 text-sm"
            />
          </div>
          <label className="mt-2 flex items-center gap-2 pl-10 text-xs font-bold text-muted">
            <input type="checkbox" name={`secret_${i}`} defaultChecked={p.secret} className="h-4 w-4 accent-brand" />
            Keep the real prize a surprise until the {EVENTS[kind].short} ends
          </label>
        </div>
      ))}
      <p className="text-xs text-muted">Set coins to 0 and leave the prize empty to have no winner for that place.</p>
      <SubmitButton className="btn-ghost w-full">Save {EVENTS[kind].short}ly prizes</SubmitButton>
    </ActionForm>
  );
}
