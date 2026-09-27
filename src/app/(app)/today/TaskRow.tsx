"use client";

import { useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { setCheckin } from "@/app/actions";
import { kindEmoji, type Kind } from "@/lib/kinds";
import { clearTicksFor, pendingTicks, queueTick, serverSnapshot, subscribe } from "@/lib/offline-queue";

export type RowStatus = { tone: "done" | "late" | "overdue" | "due" | "upcoming"; text: string };

// Orange means "needs you now"; everything else stays calm.
const TONE: Record<RowStatus["tone"], string> = {
  done: "text-emerald-600",
  late: "text-muted",
  overdue: "text-brand-dark",
  due: "text-brand-dark",
  upcoming: "text-muted",
};

const KIND_STYLE: Record<Kind, { bar: string; chip: string }> = {
  exercise: { bar: "bg-exercise", chip: "bg-orange-50" },
  supplement: { bar: "bg-supplement", chip: "bg-emerald-50" },
  medicine: { bar: "bg-medicine", chip: "bg-indigo-50" },
  other: { bar: "bg-sky-500", chip: "bg-sky-50" },
};

/** How far to swipe right before it counts as a tick. */
const SWIPE_TICK = 80;

type Props = {
  id: number;
  memberId: number;
  /** The day this item belongs to (today, or yesterday during the morning window). */
  date: string;
  kind: Kind;
  /** Emoji of a "Your own" type. */
  customEmoji?: string | null;
  title: string;
  details: string;
  time: string;
  done: boolean;
  status: RowStatus;
  /** Always-visible note, e.g. "1 of 3 this week". */
  note?: string;
  /** Coins this item earns (if the admin set its own) and the penalty for missing it. */
  coins?: number | null;
  penaltyText?: string;
  /** The big "Up next" card. */
  hero?: boolean;
  /** Large-text mode: just the name, the time and a big tick circle. */
  simple?: boolean;
};

export default function TaskRow(props: Props) {
  const { id, memberId, date, kind, customEmoji, title, details, time, done, status, note, coins, penaltyText, hero, simple } = props;
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);
  const [pending, startTransition] = useTransition();
  // A tick made offline shows straight away and is sent later (see OfflineSync).
  const queue = useSyncExternalStore(subscribe, pendingTicks, serverSnapshot);
  const queued = queue.find((p) => p.taskId === id && p.date === date && p.memberId === memberId);
  const shown = queued ? queued.done : optimisticDone;
  const emoji = kindEmoji(kind, customEmoji);
  const style = KIND_STYLE[kind];

  // Swipe right to tick.
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; swiping: boolean } | null>(null);
  const swiped = useRef(false);

  function tap() {
    const tick = { memberId, taskId: id, date, done: !shown, tappedAt: new Date().toISOString() };
    if (tick.done) navigator.vibrate?.(15);
    if (!navigator.onLine) {
      queueTick(tick);
      return;
    }
    startTransition(async () => {
      setOptimisticDone(tick.done);
      try {
        await setCheckin(tick);
        clearTicksFor(id, date);
      } catch {
        queueTick(tick); // the connection dropped: keep it for later
      }
    });
  }

  const big = hero || simple;
  const showExtras = !simple && !shown;

  return (
    <div className="relative overflow-hidden rounded-3xl">
      {/* Revealed while swiping */}
      <div className="absolute inset-0 flex items-center rounded-3xl bg-emerald-500 pl-6 text-2xl font-black text-white" aria-hidden>
        ✓
      </div>
      <button
        onClick={() => {
          if (swiped.current) {
            swiped.current = false;
            return;
          }
          tap();
        }}
        onPointerDown={(e) => {
          if (!shown) drag.current = { x: e.clientX, y: e.clientY, swiping: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const moveX = e.clientX - d.x;
          const moveY = e.clientY - d.y;
          if (!d.swiping) {
            if (Math.abs(moveY) > 10) drag.current = null; // scrolling the page
            else if (moveX > 10) {
              d.swiping = true;
              try {
                e.currentTarget.setPointerCapture(e.pointerId); // keep getting moves outside the row
              } catch {
                // not supported for this pointer: the swipe still works while over the row
              }
            }
            return;
          }
          setDx(Math.max(0, Math.min(140, moveX)));
        }}
        onPointerUp={() => {
          if (drag.current?.swiping) {
            swiped.current = true;
            if (dx >= SWIPE_TICK) tap();
          }
          drag.current = null;
          setDx(0);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDx(0);
        }}
        disabled={pending}
        aria-pressed={shown}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: "pan-y" }}
        className={`card relative flex w-full items-center gap-3 overflow-hidden text-left ${dx ? "" : "transition"} active:scale-[0.99] ${
          hero ? "py-5 pl-6" : "py-3.5 pl-5"
        } ${shown ? "opacity-75" : ""}`}
      >
        <span className={`absolute inset-y-0 left-0 ${hero ? "w-2" : "w-1.5"} ${style.bar}`} />
        <span className={`grid shrink-0 place-items-center rounded-2xl ${style.chip} ${hero ? "h-14 w-14 text-3xl" : "h-11 w-11 text-2xl"}`}>
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`line-clamp-2 block break-words font-extrabold leading-snug ${hero ? "text-xl" : simple ? "text-lg" : "text-base"} ${
              shown ? "line-through decoration-2" : ""
            }`}
          >
            {title}
          </span>
          <span className="block truncate text-sm text-muted">
            {time}
            {!simple && details && ` · ${details}`}
          </span>
          {note && !simple && <span className="block text-xs font-bold text-muted">{note}</span>}
          {showExtras && (coins != null || penaltyText) && (
            <span className="mt-0.5 flex flex-wrap gap-1 text-[11px] font-black">
              {coins != null && <span className="rounded-full bg-amber-50 px-1.5 text-amber-800">+{coins} 🪙</span>}
              {penaltyText && <span className="rounded-full bg-stone-100 px-1.5 text-red-600">{penaltyText}</span>}
            </span>
          )}
          {!shown && status.tone !== "upcoming" && <span className={`block text-xs font-bold ${TONE[status.tone]}`}>{status.text}</span>}
          {shown && done && !queued && !simple && <span className={`block text-xs font-bold ${TONE[status.tone]}`}>{status.text}</span>}
        </span>
        <span
          className={`relative grid shrink-0 place-items-center rounded-full border-2 font-black transition ${big ? "h-14 w-14 text-2xl" : "h-10 w-10 text-lg"} ${
            shown ? "animate-pop border-emerald-500 bg-emerald-500 text-white" : hero ? "border-brand text-transparent" : "border-line text-transparent"
          }`}
          aria-hidden
        >
          ✓{queued && <span className="absolute -right-1.5 -top-1.5 text-sm">⏳</span>}
        </span>
      </button>
    </div>
  );
}
