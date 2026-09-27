import type { DayActivity } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import type { Lang } from "@/lib/i18n";

/** How a day went: green all done, amber most, red little, grey when it didn't count. */
function tone(d: DayActivity): string {
  if (d.away) return "bg-sky-100 text-sky-700";
  const total = d.done.length + d.missed.length;
  if (d.notCounted || !total) return "bg-stone-100 text-muted";
  const share = d.done.length / total;
  return share === 1 ? "bg-emerald-500 text-white" : share >= 0.5 ? "bg-amber-400 text-white" : "bg-red-400 text-white";
}

/** Seven small day tiles, oldest on the left, each showing done / scheduled. */
export default function ActivityStrip({ days, lang, today }: { days: DayActivity[]; lang: Lang; today: string }) {
  return (
    <ol className="grid grid-cols-7 gap-1">
      {[...days].reverse().map((d) => {
        const total = d.done.length + d.missed.length;
        return (
          <li key={d.date} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] font-bold uppercase text-muted">{formatDate(d.date, { weekday: "narrow" }, lang)}</span>
            <span
              className={`grid h-8 w-full place-items-center rounded-lg text-[11px] font-black ${tone(d)} ${d.date === today ? "ring-2 ring-ink/20" : ""}`}
              title={`${d.date}: ${d.done.length}/${total}`}
            >
              {d.away ? "🤒" : total ? `${d.done.length}/${total}` : "–"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
