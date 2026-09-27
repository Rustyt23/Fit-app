import { BADGES, type WeekRecap } from "@/lib/stats";
import { THEME_EMOJI } from "@/lib/themes";
import { formatDate } from "@/lib/dates";
import { translator, type Lang } from "@/lib/i18n";
import Coin from "./Coin";

/** A member's week in six numbers (plus any new badges). */
export default function RecapCard({ recap, lang, title, bare = false }: { recap: WeekRecap; lang: Lang; title?: string; bare?: boolean }) {
  const t = translator(lang);
  if (recap.score === null && recap.done === 0) {
    return <p className={`${bare ? "" : "card"} text-sm text-muted`}>{t("recap.none")}</p>;
  }
  const delta = recap.score !== null && recap.prevScore !== null ? Math.round(recap.score - recap.prevScore) : null;
  const tiles: { label: string; value: React.ReactNode; sub?: string }[] = [
    {
      label: t("recap.score"),
      value: recap.score === null ? "–" : `${Math.round(recap.score)}%`,
      sub: delta === null ? undefined : t("recap.vsLast", { delta: `${delta >= 0 ? "+" : ""}${delta}` }),
    },
    { label: t("recap.done"), value: `${recap.done}/${recap.scheduled}` },
    {
      label: t("recap.coins"),
      value: (
        <span className="inline-flex items-center gap-1">
          <Coin size={18} /> {recap.coins >= 0 ? `+${recap.coins}` : recap.coins}
        </span>
      ),
    },
    { label: t("recap.perfect"), value: `💯 ${recap.perfectDays}` },
    {
      label: t("recap.best"),
      value: recap.bestDay ? formatDate(recap.bestDay.date, { weekday: "short" }, lang) : "–",
      sub: recap.bestDay ? `${Math.round(recap.bestDay.pct)}%` : undefined,
    },
    {
      label: t("recap.event"),
      value: recap.eventRank ? `${["🥇", "🥈", "🥉"][recap.eventRank - 1] ?? ""} #${recap.eventRank}` : "–",
      sub: `${THEME_EMOJI[recap.eventTheme]} ${t(`theme.${recap.eventTheme}`)}`,
    },
  ];
  return (
    <section className={bare ? "" : "card bg-gradient-to-br from-sky-50 via-white to-white"}>
      {title && <h2 className="mb-3 text-lg font-black">📊 {title}</h2>}
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl bg-white/80 px-2 py-2.5 text-center shadow-[0_1px_0_#efe6db]">
            <p className="text-lg font-black leading-tight">{tile.value}</p>
            <p className="mt-0.5 text-[11px] font-bold text-muted">{tile.label}</p>
            {tile.sub && <p className="truncate text-[10px] font-semibold text-muted">{tile.sub}</p>}
          </div>
        ))}
      </div>
      {recap.badges.length > 0 && (
        <p className="mt-3 text-sm font-bold">
          {t("recap.badges")}: {recap.badges.map((id) => BADGES.find((b) => b.id === id)!.emoji).join(" ")}
        </p>
      )}
    </section>
  );
}
