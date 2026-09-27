import { KINDS } from "@/lib/kinds";
import { COIN_BONUSES, MAX_WEIGHT, coinKey, weightKey, type GameRules } from "@/lib/rules";
import { saveGameRules } from "@/app/actions";
import ActionForm, { SubmitButton } from "./ActionForm";
import Coin from "./Coin";
import CoinSettings from "./CoinSettings";
import { translator, type Lang } from "@/lib/i18n";

function NumberInput({ name, value, label, max, coin = true }: { name: keyof GameRules; value: number; label: string; max: number; coin?: boolean }) {
  return (
    <span className="relative block">
      <input
        name={name}
        type="number"
        inputMode="numeric"
        min={coin ? 0 : 1}
        max={max}
        step={1}
        defaultValue={value}
        required
        aria-label={label}
        className={`field py-2 pr-3 text-right font-black ${coin ? "pl-8" : "pl-3"}`}
      />
      {coin && (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
          <Coin size={18} />
        </span>
      )}
    </span>
  );
}

const head = "mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-muted";

/** Admin card: how much each activity counts towards the score, and how many coins everything earns. */
export default function RulesForm({ rules }: { rules: GameRules }) {
  const totalWeight = KINDS.reduce((n, k) => n + rules[weightKey(k.value)], 0);
  return (
    <ActionForm action={saveGameRules} className="space-y-6">
      <div>
        <p className={head}>Score weight (how much each type counts)</p>
        <div className="space-y-2">
          {KINDS.map((k) => {
            const w = rules[weightKey(k.value)];
            return (
              <div key={k.value} className="grid grid-cols-[1fr_5rem] items-center gap-2">
                <span className="font-bold">
                  {k.emoji} {k.label}
                  <span className="ml-2 text-xs font-bold text-muted">≈ {Math.round((w / totalWeight) * 100)}%</span>
                </span>
                <NumberInput name={weightKey(k.value)} value={w} label={`${k.label} weight`} max={MAX_WEIGHT} coin={false} />
              </div>
            );
          })}
        </div>
        <p className="mt-2 px-1 text-xs text-muted">
          1 to {MAX_WEIGHT}. Example: exercise 2, supplement 1, medicine 2 means an exercise or medicine counts twice as much as a
          supplement. The % shows each type&apos;s share on a day with one of each. You can also mark single items as more
          important when editing a routine.
        </p>
      </div>

      <CoinSettings rules={rules} />

      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
        Changes count from today. Scores and coins from earlier days stay the same, so nobody&apos;s history changes.
      </p>
      <SubmitButton className="btn w-full">Save rules</SubmitButton>
    </ActionForm>
  );
}

/** Read-only list of the current coin rules, for members. */
export function CoinRulesList({ rules, lang }: { rules: GameRules; lang: Lang }) {
  const t = translator(lang);
  const rows: { label: string; coins: number }[] = [
    ...KINDS.flatMap((k) => [
      { label: `${k.emoji} ${t("rule.onTime", { kind: t(`kind.${k.value}`) })}`, coins: rules[coinKey(k.value, true)] },
      { label: `${k.emoji} ${t("rule.late", { kind: t(`kind.${k.value}`) })}`, coins: rules[coinKey(k.value, false)] },
    ]),
    ...COIN_BONUSES.map((b) => ({ label: `${b.emoji} ${t(`rule.${b.key}` as "rule.badge")}`, coins: rules[b.key] })),
  ];
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-1.5">
          <span>{r.label}</span>
          <b className="inline-flex shrink-0 items-center gap-1 text-amber-800">
            +{r.coins} <Coin size={14} />
          </b>
        </li>
      ))}
      <li className="rounded-xl bg-white/70 px-3 py-1.5 text-xs text-muted">{t("rule.prizes")}</li>
      <li className="rounded-xl bg-white/70 px-3 py-1.5 text-xs text-muted">{t("rule.perTask")}</li>
    </ul>
  );
}
