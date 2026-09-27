"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { translator, type Lang } from "@/lib/i18n";

const pad = (n: number) => String(n).padStart(2, "0");

/** Live "2d 04:12:33" countdown to an instant; refreshes the page when it reaches zero. */
export default function Countdown({ endsAt, compact = false, lang = "en" }: { endsAt: number; compact?: boolean; lang?: Lang }) {
  const t = translator(lang);
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const left = now === null ? null : Math.max(0, endsAt - now);
  useEffect(() => {
    // When it ends, reload so the finished event's winners appear.
    if (left === 0) {
      const id = setTimeout(() => router.refresh(), 3000);
      return () => clearTimeout(id);
    }
  }, [left, router]);

  if (left === null) return <span className="tabular-nums opacity-60">--:--:--</span>;
  if (left === 0) return <span className="font-black">{t("count.finished")}</span>;

  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (compact) {
    return <span className="tabular-nums">{d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(sec)}`}</span>;
  }
  return (
    <span className="inline-flex gap-1.5 tabular-nums" role="timer" aria-label={`${d} days ${h} hours ${m} minutes left`}>
      {[
        [d, t("count.days")],
        [h, t("count.hrs")],
        [m, t("count.min")],
        [sec, t("count.sec")],
      ].map(([v, unit]) => (
        <span key={unit} className="flex min-w-11 flex-col items-center rounded-xl bg-white/80 px-1.5 py-1 shadow-sm">
          <span className="text-lg font-black leading-none">{pad(v as number)}</span>
          <span className="text-[10px] font-bold uppercase text-muted">{unit}</span>
        </span>
      ))}
    </span>
  );
}
