import { BADGES, type EarnedBadge } from "@/lib/stats";
import { formatDate } from "@/lib/dates";
import { BADGE_TEXT, translator, type Lang } from "@/lib/i18n";

export default function BadgeGrid({ earned, lang = "en" }: { earned: EarnedBadge[]; lang?: Lang }) {
  const t = translator(lang);
  const byId = new Map(earned.map((b) => [b.id, b]));
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {BADGES.map((b) => {
        const got = byId.get(b.id);
        const text = BADGE_TEXT[lang][b.id];
        return (
          <li
            key={b.id}
            title={text.how}
            className={`relative flex flex-col items-center rounded-2xl border p-2.5 text-center ${
              got ? "border-amber-200 bg-gradient-to-b from-amber-50 to-white" : "border-line bg-stone-50"
            }`}
          >
            <span className={`text-3xl ${got ? "" : "opacity-30 grayscale"}`}>{b.emoji}</span>
            <span className={`mt-1 text-xs font-extrabold leading-tight ${got ? "" : "text-muted"}`}>{text.name}</span>
            <span className="mt-0.5 text-[10px] leading-tight text-muted">
              {got ? t("me.earned", { date: formatDate(got.first, { day: "numeric", month: "short" }, lang) }) : text.how}
            </span>
            {got && got.count > 1 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-brand px-1.5 text-[11px] font-black text-white">×{got.count}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
