import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { BREAK_REASONS, activeMembers } from "@/lib/data";
import { eventNow, eventResults, eventStandings, finalizeEvents, periodAwards, standings, type Standing } from "@/lib/stats";
import { hasPrize, type Prize } from "@/lib/rules";
import { THEME_EMOJI } from "@/lib/themes";
import { translator, type T } from "@/lib/i18n";
import { addDays, formatDate, formatMonth, prevMonth, startOfMonth, startOfWeek, today } from "@/lib/dates";
import Avatar from "@/components/Avatar";
import EventCard from "@/components/EventCard";
import EmptyState from "@/components/EmptyState";

const RANGES = {
  today: { key: "lb.today", from: (d: string) => d },
  week: { key: "lb.week", from: startOfWeek },
  month: { key: "lb.month", from: startOfMonth },
} as const;
type Range = keyof typeof RANGES;

const MEDAL = ["var(--color-gold)", "var(--color-silver)", "var(--color-bronze)"];

const pct = (s: Standing) => (s.score === null ? "–" : `${Math.round(s.score)}%`);

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const me = await requireMember();
  const t = translator(me.lang);
  const { range: raw } = await searchParams;
  const range: Range = raw && raw in RANGES ? (raw as Range) : "today";
  await finalizeEvents();
  const to = today();
  const from = RANGES[range].from(to);
  const event = range === "today" ? null : await eventNow(range);
  const [rows, eventRows, awards, members, results] = await Promise.all([
    standings(from, to),
    event ? eventStandings(event, to) : Promise.resolve([] as Standing[]),
    range === "today" ? [] : periodAwards(from, to, range === "week" ? addDays(from, -7) : prevMonth(from), addDays(from, -1)),
    activeMembers(),
    range === "today" ? [] : eventResults(range),
  ]);
  const ranked = rows.filter((r) => r.rank > 0);
  const onBreak = rows.filter((r) => r.rank === 0 && r.away);
  const noRoutine = rows.filter((r) => r.rank === 0 && !r.away);
  const names = new Map(members.map((m) => [m.id, m]));
  const hall = results.filter((g) => names.has(g.member_id));
  const hallPeriods = [...new Set(hall.map((g) => g.period))].slice(0, range === "week" ? 4 : 6);
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const short = (d: string) => formatDate(d, { day: "numeric", month: "short" }, me.lang);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black">{t("lb.title")}</h1>
        <p className="text-sm font-bold text-muted">{range === "today" ? formatDate(to, undefined, me.lang) : `${short(from)} – ${short(to)}`}</p>
      </div>

      <nav className="flex rounded-2xl bg-white p-1 shadow-sm">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link
            key={r}
            href={`/leaderboard?range=${r}`}
            className={`flex-1 rounded-xl py-2 text-center text-sm font-extrabold transition ${r === range ? "bg-ink text-white" : "text-muted"}`}
          >
            {t(RANGES[r].key)}
          </Link>
        ))}
      </nav>

      {event && <EventCard event={event} standings={eventRows} meId={me.id} lang={me.lang} />}

      {ranked.length === 0 ? (
        <EmptyState
          title={t("empty.rank")}
          text={t("empty.rankSub")}
          action={me.is_admin ? { href: "/admin", label: t("empty.rankAdmin") } : undefined}
        />
      ) : (
        <section className="card overflow-hidden pb-0 pt-8">
          <div className="flex items-end justify-center gap-2">
            {[podium[1], podium[0], podium[2]].map((s, i) =>
              s ? (
                <PodiumSpot key={s.member.id} s={s} place={[1, 0, 2][i]} range={range} prizes={event?.prizes ?? []} isMe={s.member.id === me.id} t={t} />
              ) : (
                <div key={i} className="flex-1" />
              ),
            )}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <ul className="space-y-2">
          {rest.map((s) => (
            <li key={s.member.id} className={`card flex items-center gap-3 py-3 ${s.member.id === me.id ? "ring-2 ring-stone-300" : ""}`}>
              <span className="w-7 text-center text-lg font-black text-muted">{s.rank}</span>
              <Avatar member={s.member} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">
                  {s.member.name}
                  {s.streak > 1 && <span className="ml-1.5 text-xs font-black text-brand-dark">🔥{s.streak}</span>}
                </p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full" style={{ width: `${s.score ?? 0}%`, background: s.member.color }} />
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-black">{pct(s)}</p>
                <p className="text-[11px] font-bold text-muted">{t("lb.done", { done: s.done, total: s.scheduled })}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {onBreak.length > 0 && (
        <p className="px-1 text-sm text-muted">
          {t("lb.onBreak", { names: onBreak.map((s) => `${BREAK_REASONS[s.away!.reason].emoji} ${s.member.name}`).join(", ") })}
        </p>
      )}
      {noRoutine.length > 0 && <p className="px-1 text-sm text-muted">{t("lb.notRanked", { names: noRoutine.map((s) => s.member.name).join(", ") })}</p>}

      {awards.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-extrabold uppercase tracking-wider text-muted">
            🏅 {t(range === "week" ? "lb.awardsWeek" : "lb.awardsMonth")}
          </h2>
          <ul className="grid grid-cols-2 gap-2.5">
            {awards.map((a) => (
              <li key={a.id} className="card flex flex-col gap-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{a.emoji}</span>
                  <span className="font-black leading-tight">{t(`award.${a.id}`)}</span>
                </div>
                <div className="flex -space-x-2">
                  {a.winners.slice(0, 5).map((m) => (
                    <Avatar key={m.id} member={m} size={30} className="ring-2 ring-white" />
                  ))}
                </div>
                <p className="text-xs leading-snug text-muted">
                  <b className="text-ink">{a.winners.map((m) => m.name).join(", ")}</b> · {t(`award.${a.id}.why`, { n: a.value })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hallPeriods.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-lg font-black">🏛️ {t("lb.hall")}</h2>
          <ul className="space-y-3">
            {hallPeriods.map((period) => {
              const winners = hall.filter((g) => g.period === period);
              const theme = winners[0]?.theme ?? "all";
              return (
                <li key={period}>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                    {range === "month" ? formatMonth(period, me.lang) : t("lb.weekOf", { date: short(period) })} · {THEME_EMOJI[theme]} {t(`theme.${theme}`)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {winners.map((g) => (
                      <span key={g.member_id} className="flex items-center gap-2">
                        <Avatar member={names.get(g.member_id)!} size={32} />
                        <span className="text-sm">
                          <b>
                            {["🥇", "🥈", "🥉"][g.place - 1]} {names.get(g.member_id)!.name}
                          </b>{" "}
                          {theme === "improved" ? t("lb.points", { n: Math.round(g.score) }) : `${Math.round(g.score)}%`}
                          <span className="block text-[11px] text-muted">
                            {[g.prize_coins ? `+${g.prize_coins} 🪙` : "", g.prize_text ? `${g.prize_text}${g.delivered_at ? " ✓" : ""}` : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="px-1 text-xs text-muted">{t("lb.explain")}</p>
    </div>
  );
}

function PodiumSpot({ s, place, range, prizes, isMe, t }: { s: Standing; place: number; range: Range; prizes: Prize[]; isMe: boolean; t: T }) {
  const heights = ["h-28", "h-20", "h-14"];
  const sizes = [92, 72, 64];
  // Medal colour and crown follow the rank, so tied members look the same.
  const medal = MEDAL[Math.min(s.rank, 3) - 1];
  const crown = s.rank === 1 ? (range === "today" ? "⭐" : "👑") : null;
  const gift = range !== "today" && hasPrize(prizes[s.rank - 1]);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <div className="relative mb-2">
        {crown && <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-3xl drop-shadow">{crown}</span>}
        <Avatar member={s.member} size={sizes[place]} ring={medal} />
        {gift && <span className="absolute -bottom-1 -right-1 text-xl">🎁</span>}
      </div>
      <p className={`max-w-full truncate px-1 font-extrabold ${isMe ? "underline decoration-2 underline-offset-4" : ""}`}>{s.member.name}</p>
      {s.streak > 1 && <p className="text-[11px] font-black text-brand-dark">{t("lb.days", { n: s.streak })}</p>}
      <p className="text-xl font-black">{pct(s)}</p>
      {s.rank === 1 && range === "today" && <p className="text-[11px] font-extrabold uppercase text-amber-600">{t("lb.star")}</p>}
      <div className={`mt-2 flex w-full items-start justify-center rounded-t-2xl pt-2 text-2xl font-black text-white ${heights[place]}`} style={{ background: medal }}>
        {s.rank}
      </div>
    </div>
  );
}
