import { requireMember } from "@/lib/auth";
import { activeRewards, redemptionsOf } from "@/lib/data";
import { achievementsFor, finalizeEvents } from "@/lib/stats";
import { currentRules } from "@/lib/rules";
import { cancelRedemption, redeemReward } from "@/app/actions";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import Coin, { CoinAmount } from "@/components/Coin";
import EmptyState from "@/components/EmptyState";
import { CoinRulesList } from "@/components/RulesForm";
import { translator } from "@/lib/i18n";

const STATUS = {
  requested: { key: "shop.requested", cls: "bg-amber-50 text-amber-800" },
  given: { key: "shop.given", cls: "bg-emerald-50 text-emerald-700" },
  declined: { key: "shop.declined", cls: "bg-stone-100 text-muted" },
} as const;

export default async function ShopPage() {
  const me = await requireMember();
  const t = translator(me.lang);
  await finalizeEvents();
  const [ach, rewards, mine, rules] = await Promise.all([achievementsFor(me.id), activeRewards(), redemptionsOf(me.id), currentRules()]);

  return (
    <div className="space-y-5">
      <section className="card bg-gradient-to-br from-amber-100 via-amber-50 to-white text-center">
        <p className="text-sm font-extrabold uppercase tracking-wider text-amber-700">{t("shop.myCoins")}</p>
        <p className="mt-1 flex items-center justify-center gap-3 text-5xl font-black text-amber-900">
          <Coin size={52} className="coin-shine coin-float" />
          {ach.coins}
        </p>
        <p className="mt-1 text-xs text-amber-800/70">
          {t("shop.earnedSpent", { earned: ach.coinsEarned, spent: ach.coinsSpent })}
          {ach.prizeCoins ? ` ${t("shop.fromPrizes", { n: ach.prizeCoins })}` : ""}
          {ach.coinsPenalty > 0 && <span className="block font-bold text-red-600">{t("shop.penalties", { n: ach.coinsPenalty })}</span>}
        </p>
        <details className="mt-3 text-left">
          <summary className="cursor-pointer text-center text-sm font-bold text-amber-800 underline">{t("shop.howEarn")}</summary>
          <CoinRulesList rules={rules} lang={me.lang} />
        </details>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wider text-muted">🛍️ {t("shop.rewards")}</h2>
        {rewards.length === 0 ? (
          <EmptyState
            title={t("empty.shop")}
            text={me.is_admin ? undefined : t("shop.askAdmin")}
            action={me.is_admin ? { href: "/admin#shop", label: t("shop.addSome") } : undefined}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-2.5">
            {rewards.map((r) => {
              const short = r.cost - ach.coins;
              return (
                <li key={r.id} className="card flex flex-col p-3">
                  {r.hidden ? (
                    <>
                      {/* The real reward is never sent to the browser until someone buys it. */}
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl text-white shadow">
                        ?
                      </span>
                      <span className="mt-1 flex-1 font-extrabold leading-snug">
                        {t("shop.mystery")}
                        <span className="block text-xs font-bold text-violet-600">{t("shop.mysteryHint")}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl">{r.emoji}</span>
                      <span className="mt-1 flex-1 font-extrabold leading-snug">{r.title}</span>
                    </>
                  )}
                  <ActionForm
                    action={redeemReward}
                    confirm={r.hidden ? t("shop.confirmMystery", { cost: r.cost }) : t("shop.confirm", { cost: r.cost, title: r.title })}
                    className="mt-2"
                  >
                    <input type="hidden" name="id" value={r.id} />
                    {short > 0 ? (
                      <div>
                        <CoinAmount value={r.cost} className="text-sm" />
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                          <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(4, (ach.coins / r.cost) * 100)}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] font-bold text-muted">{t("shop.moreToGo", { n: short })}</p>
                      </div>
                    ) : (
                      <SubmitButton className="btn w-full py-2 text-sm" pendingText="…">
                        {t("shop.getIt")} · <CoinAmount value={r.cost} light />
                      </SubmitButton>
                    )}
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wider text-muted">{t("shop.myRequests")}</h2>
          <ul className="space-y-2">
            {mine.map((r) => (
              <li key={r.id} className="card flex items-center gap-3 py-3">
                <span className="text-2xl">{r.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold">{r.title}</span>
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[r.status].cls}`}>
                    {t(STATUS[r.status].key)}
                  </span>
                </span>
                <CoinAmount value={r.cost} className="text-sm" />
                {r.status === "requested" && (
                  <ActionForm action={cancelRedemption} confirm={t("shop.cancelConfirm")}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton className="btn-danger" pendingText="…">
                      {t("shop.cancel")}
                    </SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
