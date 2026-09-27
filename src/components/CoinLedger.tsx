import type { CoinEntry } from "@/lib/stats";
import { COIN_BONUSES } from "@/lib/game";
import { formatDate } from "@/lib/dates";
import { BADGE_TEXT, translator, type Lang } from "@/lib/i18n";
import Coin from "./Coin";

const SHOW = 25;

function describe(e: CoinEntry, lang: Lang): { icon: string; text: string } {
  const t = translator(lang);
  switch (e.kind) {
    case "tasks":
      return { icon: "✅", text: t("ledger.tasks") };
    case "penalty":
      return { icon: "➖", text: t("ledger.penalty") };
    case "badge":
      return {
        icon: COIN_BONUSES.find((b) => b.badge === e.badge)?.emoji ?? "🏅",
        text: t("ledger.badge", { badge: e.badge ? BADGE_TEXT[lang][e.badge].name : "" }),
      };
    case "prize":
      return { icon: "🏆", text: t(e.event === "month" ? "ledger.prizeMonth" : "ledger.prizeWeek", { place: e.place ?? 1 }) };
    case "spent":
      return { icon: "🛍️", text: t("ledger.spent", { reward: e.text ?? "" }) };
    default: {
      // Admin gifts are saved as "🎁 reason"; report and help outcomes as plain text.
      const text = e.text ?? "";
      const icon = /^\p{Extended_Pictographic}/u.test(text) ? [...text][0] : e.amount < 0 ? "🚩" : "🤝";
      return { icon, text: text.replace(/^\p{Extended_Pictographic}\s*/u, "") };
    }
  }
}

/** Every coin in and out, grouped by day, newest first. */
export default function CoinLedger({ ledger, lang }: { ledger: CoinEntry[]; lang: Lang }) {
  const t = translator(lang);
  if (!ledger.length) return <p className="text-sm text-muted">{t("ledger.empty")}</p>;
  const list = (entries: CoinEntry[]) => {
    const days = [...new Set(entries.map((e) => e.date))];
    return days.map((date) => (
      <li key={date}>
        <p className="mb-1 px-1 text-xs font-extrabold uppercase tracking-wider text-muted">
          {formatDate(date, { weekday: "short", day: "numeric", month: "short" }, lang)}
        </p>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white">
          {entries
            .filter((e) => e.date === date)
            .map((e, i) => {
              const d = describe(e, lang);
              return (
                <li key={i} className="flex items-center gap-3 px-3 py-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-50 text-base">{d.icon}</span>
                  <span className="min-w-0 flex-1 text-sm font-semibold">{d.text}</span>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-sm font-black ${e.amount < 0 ? "text-red-600" : "text-amber-800"}`}>
                    {e.amount > 0 ? "+" : "−"}
                    {Math.abs(e.amount)} <Coin size={14} />
                  </span>
                </li>
              );
            })}
        </ul>
      </li>
    ));
  };
  // Keep whole days together when cutting the list short.
  const cutDate = ledger[Math.min(SHOW, ledger.length) - 1].date;
  const first = ledger.filter((e) => e.date >= cutDate);
  const older = ledger.filter((e) => e.date < cutDate);
  return (
    <div>
      <ul className="space-y-3">{list(first)}</ul>
      {older.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer list-none text-center text-sm font-bold text-brand-dark [&::-webkit-details-marker]:hidden">{t("ledger.more")}</summary>
          <ul className="mt-3 space-y-3">{list(older)}</ul>
        </details>
      )}
    </div>
  );
}
