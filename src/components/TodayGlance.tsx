import Link from "next/link";
import { EVENTS, type EventNow, type Standing } from "@/lib/stats";
import { THEME_EMOJI } from "@/lib/themes";
import { translator, type Lang } from "@/lib/i18n";
import Avatar from "./Avatar";
import Countdown from "./Countdown";
import ProgressRing from "./ProgressRing";

const BREAK_EMOJI = { sick: "🤒", travel: "✈️" } as const;

/**
 * One compact card instead of two: the weekly challenge (theme, time left, your place)
 * and how everyone is doing today. Tapping it opens the full ranking.
 */
export default function TodayGlance({
  event,
  eventRows,
  board,
  meId,
  lang,
}: {
  event: EventNow;
  eventRows: Standing[];
  board: Standing[];
  meId: number;
  lang: Lang;
}) {
  const t = translator(lang);
  const mine = eventRows.find((s) => s.member.id === meId);
  return (
    <Link href="/leaderboard?range=week" className="card block p-0">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm">
        <span className="min-w-0 flex-1 truncate font-extrabold">
          {EVENTS.week.emoji} {THEME_EMOJI[event.theme]} {t(`theme.${event.theme}`)}
        </span>
        <span className="shrink-0 text-xs font-bold text-muted">
          ⏳ <Countdown endsAt={event.endsAt} compact lang={lang} />
        </span>
        {mine && mine.rank > 0 && (mine.score ?? 0) > 0 && (
          <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-black">{t("event.you", { n: mine.rank })}</span>
        )}
        <span className="text-muted">›</span>
      </div>
      {board.length > 1 && (
        <div className="flex gap-4 overflow-x-auto px-4 py-3">
          {board.map((s) => (
            <div key={s.member.id} className="flex w-14 shrink-0 flex-col items-center gap-1">
              <div className="relative">
                <ProgressRing percent={s.score ?? 0} size={52} stroke={4} color={s.member.color}>
                  <Avatar member={s.member} size={40} />
                </ProgressRing>
                {s.away ? (
                  <span className="absolute -bottom-1 -right-1 text-base">{BREAK_EMOJI[s.away.reason]}</span>
                ) : (
                  s.streak > 1 && (
                    <span className="absolute -bottom-1 -right-2 rounded-full bg-white px-1 text-[10px] font-black shadow">🔥{s.streak}</span>
                  )
                )}
              </div>
              <span className="w-full truncate text-center text-[11px] font-bold">{s.member.name}</span>
              <span className="text-[11px] font-extrabold text-muted">
                {s.away ? t("today.break") : s.score === null ? "–" : `${Math.round(s.score)}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
