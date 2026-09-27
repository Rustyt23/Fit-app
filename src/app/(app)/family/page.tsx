import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { BREAK_REASONS, activeMembers, recentActivity, redemptionsOf } from "@/lib/data";
import { achievements, standings } from "@/lib/stats";
import { formatDate, startOfMonth, today } from "@/lib/dates";
import { kindEmoji } from "@/lib/kinds";
import { translator } from "@/lib/i18n";
import ActivityStrip from "@/components/ActivityStrip";
import Avatar from "@/components/Avatar";
import { CoinAmount } from "@/components/Coin";

const REDEMPTION_KEY = { requested: "shop.requested", given: "shop.given", declined: "shop.declined" } as const;

/**
 * Everyone's follow-up on one page: rank and coins, what they did and what's left today,
 * the last 7 days, what they missed, and the rewards they chose.
 */
export default async function FamilyPage() {
  const me = await requireMember();
  const t = translator(me.lang);
  const date = today();
  const [members, month, ach] = await Promise.all([activeMembers(), standings(startOfMonth(date), date), achievements()]);
  const rankOf = new Map(month.map((s) => [s.member.id, s]));
  // Best this month first; people without a rank (no routine yet) at the end.
  const ordered = [...members].sort((a, b) => (rankOf.get(a.id)?.rank || 99) - (rankOf.get(b.id)?.rank || 99));
  const details = await Promise.all(ordered.map((m) => Promise.all([recentActivity(m, 7), redemptionsOf(m.id, 3)])));
  const day = (d: string) => formatDate(d, { weekday: "short" }, me.lang);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">{t("fam.pageTitle")}</h1>
        <p className="text-sm font-bold text-muted">{t("fam.pageSub")}</p>
      </div>

      {ordered.map((m, i) => {
        const [days, chosen] = details[i];
        const todayActivity = days[0];
        const s = rankOf.get(m.id);
        const a = ach.get(m.id);
        const missed = days.slice(1).flatMap((d) => d.missed.map((x) => ({ ...x, date: d.date })));
        return (
          <section key={m.id} className={`card space-y-3 ${m.id === me.id ? "ring-2 ring-stone-300" : ""}`}>
            <Link href={`/member/${m.id}`} className="flex items-center gap-3">
              <Avatar member={m} size={52} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-black">
                  {m.name}
                  {m.id === me.id && <span className="ml-1.5 text-xs font-bold text-muted">({t("fam.you")})</span>}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs font-extrabold text-muted">
                  {s && s.rank > 0 && (s.score ?? 0) > 0 && <span className="text-ink">{t("fam.rankMonth", { n: s.rank })}</span>}
                  {s?.score != null && <span>{Math.round(s.score)}%</span>}
                  {!!a?.streak.current && <span>🔥 {a.streak.current}</span>}
                  {s?.away && <span>{BREAK_REASONS[s.away.reason].emoji}</span>}
                </span>
              </span>
              <CoinAmount value={a?.coins ?? 0} className="shrink-0" />
            </Link>

            <div>
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted">
                {t("fam.today")} · {t("today.progress", { done: todayActivity.done.length, total: todayActivity.done.length + todayActivity.missed.length })}
              </p>
              <ul className="flex flex-wrap gap-1.5 text-xs font-bold">
                {todayActivity.done.map((x) => (
                  <li key={`d${x.id}`} className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-800">
                    ✓ {kindEmoji(x.kind, x.custom_emoji)} {x.title}
                  </li>
                ))}
                {todayActivity.missed.map((x) => (
                  <li key={`m${x.id}`} className="rounded-full bg-stone-100 px-2 py-1 text-muted">
                    ⏳ {kindEmoji(x.kind, x.custom_emoji)} {x.title}
                  </li>
                ))}
                {!todayActivity.done.length && !todayActivity.missed.length && <li className="text-muted">{t("fam.nothing")}</li>}
              </ul>
            </div>

            <div>
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted">{t("fam.last7")}</p>
              <ActivityStrip days={days} lang={me.lang} today={date} />
            </div>

            <div>
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted">{t("fam.missed")}</p>
              {missed.length ? (
                <ul className="flex flex-wrap gap-1.5 text-xs font-bold">
                  {missed.slice(0, 8).map((x) => (
                    <li key={`${x.id}|${x.date}`} className="rounded-full bg-red-50 px-2 py-1 text-red-700">
                      {kindEmoji(x.kind, x.custom_emoji)} {x.title} · {day(x.date)}
                    </li>
                  ))}
                  {missed.length > 8 && <li className="px-1 py-1 text-muted">+{missed.length - 8}</li>}
                </ul>
              ) : (
                <p className="text-xs font-bold text-emerald-700">{t("fam.noMissed")}</p>
              )}
            </div>

            <div>
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted">{t("fam.choices")}</p>
              {chosen.length ? (
                <ul className="space-y-1 text-sm">
                  {chosen.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {r.emoji} {r.title} <span className="text-xs text-muted">· {formatDate(r.requested_at.slice(0, 10), { day: "numeric", month: "short" }, me.lang)}</span>
                      </span>
                      <span className="shrink-0 text-xs font-bold text-muted">{t(REDEMPTION_KEY[r.status])}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">{t("fam.noChoices")}</p>
              )}
            </div>

            <Link href={`/member/${m.id}`} className="block text-right text-sm font-bold text-brand-dark">
              {t("fam.seeDay", { name: m.name })}
            </Link>
          </section>
        );
      })}
    </div>
  );
}
