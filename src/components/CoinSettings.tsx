"use client";

import { useState } from "react";
import { KINDS } from "@/lib/kinds";
import { COIN_BONUSES, COIN_KEYS, COIN_PRESETS, MAX_COINS_PER_RULE, coinKey, matchPreset, type GameRules } from "@/lib/game";
import Coin from "./Coin";

const head = "mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-muted";
const card =
  "flex cursor-pointer flex-col items-center gap-0.5 rounded-2xl border border-line bg-white px-2 py-2.5 text-center text-sm font-bold text-muted transition has-[:checked]:border-brand has-[:checked]:bg-orange-50 has-[:checked]:text-brand-dark";

function CoinInput({ name, value, label }: { name: keyof GameRules; value: number; label: string }) {
  return (
    <span className="relative block">
      <input
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_COINS_PER_RULE}
        step={1}
        defaultValue={value}
        required
        aria-label={label}
        className="field py-2 pl-8 pr-3 text-right font-black"
      />
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
        <Coin size={18} />
      </span>
    </span>
  );
}

/** Coin amounts: pick Normal / Generous / Strict, or Custom to set every number. */
export default function CoinSettings({ rules }: { rules: GameRules }) {
  const [mode, setMode] = useState(matchPreset(rules));
  // What Custom starts from: the current amounts, or the preset picked just before.
  const [base, setBase] = useState<GameRules>(rules);
  const preset = COIN_PRESETS.find((p) => p.id === mode);

  const choose = (m: typeof mode) => {
    if (m === "custom" && preset) setBase({ ...base, ...preset.coins });
    setMode(m);
  };

  return (
    <div>
      <p className={head}>Coins</p>
      <div className="grid grid-cols-4 gap-2">
        {[...COIN_PRESETS, { id: "custom" as const, emoji: "🎛️", label: "Custom", how: "" }].map((p) => (
          <label key={p.id} className={card}>
            <input type="radio" checked={mode === p.id} onChange={() => choose(p.id)} className="sr-only" />
            <span className="text-xl">{p.emoji}</span>
            {p.label}
          </label>
        ))}
      </div>

      {preset ? (
        <>
          <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-xs font-semibold text-muted">{preset.how}</p>
          {COIN_KEYS.map((k) => (
            <input key={k} type="hidden" name={k} value={preset.coins[k] ?? rules[k]} />
          ))}
        </>
      ) : (
        <div className="mt-4 space-y-5">
          <div>
            <div className={`${head} grid grid-cols-[1fr_5rem_5rem] gap-2`}>
              <span>Per task</span>
              <span className="text-center">On time</span>
              <span className="text-center">Late</span>
            </div>
            <div className="space-y-2">
              {KINDS.map((k) => (
                <div key={k.value} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2">
                  <span className="font-bold">
                    {k.emoji} {k.label}
                  </span>
                  <CoinInput name={coinKey(k.value, true)} value={base[coinKey(k.value, true)]} label={`${k.label} on time`} />
                  <CoinInput name={coinKey(k.value, false)} value={base[coinKey(k.value, false)]} label={`${k.label} late`} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className={head}>Bonuses</p>
            <div className="space-y-2">
              {COIN_BONUSES.map((b) => (
                <div key={b.key} className="grid grid-cols-[1fr_5rem] items-center gap-2">
                  <span className="text-sm font-bold">
                    {b.emoji} {b.label}
                  </span>
                  <CoinInput name={b.key} value={base[b.key]} label={b.label} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
