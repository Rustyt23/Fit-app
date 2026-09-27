"use client";

import { useState } from "react";
import { giftCoins } from "@/app/actions";
import ActionForm, { SubmitButton } from "./ActionForm";
import Coin from "./Coin";
import MemberPicker, { type PickableMember } from "./MemberPicker";
import type { Lang } from "@/lib/i18n";
import { adminText } from "@/lib/i18n-admin";

const QUICK = [5, 10, 20, 50];

/** Give coins to one person, several or everyone, with a reason they'll see in their coin history. */
export default function GiftCoinsForm({ members, lang = "en" }: { members: PickableMember[]; lang?: Lang }) {
  const t = adminText(lang);
  const [people, setPeople] = useState(0);
  const [amount, setAmount] = useState(10);
  return (
    <ActionForm action={giftCoins} resetOnSuccess onSuccess={() => setPeople(0)} className="space-y-4">
      <div>
        <p className="label">{t("gf.who")}</p>
        <MemberPicker members={members} onChange={(ids) => setPeople(ids.length)} lang={lang} />
      </div>
      <div>
        <label className="label" htmlFor="gift-amount">
          {t("gf.howMany")}
        </label>
        <div className="flex gap-2">
          <span className="relative block w-32 shrink-0">
            <input
              id="gift-amount"
              name="amount"
              type="number"
              min={1}
              max={1000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
              className="field pl-9 text-right font-black"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <Coin size={18} />
            </span>
          </span>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {QUICK.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAmount(n)}
                className={`rounded-full border px-3 text-sm font-bold ${amount === n ? "border-brand bg-orange-50 text-brand-dark" : "border-line bg-white text-muted"}`}
              >
                +{n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="gift-reason">
          {t("gf.why")}
        </label>
        <input id="gift-reason" name="reason" className="field" placeholder={t("gf.placeholder")} maxLength={120} required />
      </div>
      <SubmitButton className="btn w-full" pendingText={t("gf.giving")}>
        🎁 {people > 1 ? t("gf.giveMany", { n: amount > 0 ? amount : "", people }) : t("gf.give", { n: amount > 0 ? amount : "" })}
      </SubmitButton>
    </ActionForm>
  );
}
