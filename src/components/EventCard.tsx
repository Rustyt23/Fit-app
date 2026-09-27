import { EVENTS, type EventNow, type Standing } from "@/lib/stats";
import { hasPrize } from "@/lib/rules";
import { THEME_EMOJI } from "@/lib/themes";
import { formatDate } from "@/lib/dates";
import { translator, type Lang } from "@/lib/i18n";
import Avatar from "./Avatar";
import { CoinAmount } from "./Coin";
import Countdown from "./Countdown";

const MEDALS = ["🥇", "🥈", "🥉"];

/** The running weekly/monthly event: its theme, a live countdown, the prizes, and who's in line for them. */
export default function EventCard({ event, standings, meId, lang }: { event: EventNow; standings: Standing[]; meId: number; lang: Lang }) {
  const t = translator(lang);
  const e = EVENTS[event.kind];
  const places = event.prizes.map((prize, i) => ({ prize, place: i + 1 })).filter((p) => hasPrize(p.prize));
  const leaders = (place: number) => standings.filter((s) => s.rank === place && (s.score ?? 0) > 0);
  const mine = standings.find((s) => s.member.id === meId);
  const bg = event.kind === "week" ? "from-violet-100 via-fuchsia-50 to-white" : "from-amber-100 via-orange-50 to-white";
  const short = (d: string) => formatDate(d, { day: "numeric", month: "short" }, lang);

  return (
    <section className={`card bg-gradient-to-br ${bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
            {e.emoji} {t(event.kind === "week" ? "event.week" : "event.month")}
          </p>
          <p className="text-sm font-bold text-muted">
            {short(event.start)} – {short(event.end)}
          </p>
        </div>
        {mine && mine.rank > 0 && (mine.score ?? 0) > 0 && (
          <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-xs font-black shadow-sm">
            {t("event.you", { n: mine.rank })}
          </span>
        )}
      </div>

      <div className="mt-3 rounded-2xl bg-white/70 px-3 py-2">
        <p className="font-black">
          {THEME_EMOJI[event.theme]} {t(`theme.${event.theme}`)}
        </p>
        <p className="text-xs text-muted">{t(`theme.${event.theme}.how`)}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-extrabold">{t("event.endsIn")}</span>
        <Countdown endsAt={event.endsAt} lang={lang} />
      </div>

      {places.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {places.map(({ prize, place }) => {
            const now = leaders(place);
            return (
              <li key={place} className="flex items-center gap-3 rounded-2xl bg-white/80 px-3 py-2">
                <span className="text-2xl">{MEDALS[place - 1]}</span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex flex-wrap items-center gap-x-2 font-extrabold">
                    {prize.coins > 0 && <CoinAmount value={prize.coins} size={15} />}
                    {prize.prize && (prize.secret ? <span>{t("event.surprise")}</span> : <span>{prize.prize}</span>)}
                  </span>
                  <span className="block text-xs text-muted">
                    {now.length ? t("event.rightNow", { names: now.map((s) => s.member.name).join(", ") }) : t("event.upForGrabs")}
                  </span>
                </span>
                <span className="flex -space-x-2">
                  {now.slice(0, 3).map((s) => (
                    <Avatar key={s.member.id} member={s.member} size={28} className="ring-2 ring-white" />
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{t("event.noPrizes")}</p>
      )}
      <p className="mt-3 text-[11px] text-muted">{t("event.footer")}</p>
    </section>
  );
}
