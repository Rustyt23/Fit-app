"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { setCheckin } from "@/app/actions";
import { dropTick, pendingTicks, serverSnapshot, subscribe } from "@/lib/offline-queue";
import { translator, type Lang } from "@/lib/i18n";

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/**
 * Registers the service worker (so the app opens offline), shows an offline banner,
 * and sends ticks that were made offline as soon as the connection is back.
 */
export default function OfflineSync({ memberId, lang }: { memberId: number; lang: Lang }) {
  const t = translator(lang);
  const router = useRouter();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const queue = useSyncExternalStore(subscribe, pendingTicks, serverSnapshot);
  const mine = queue.filter((p) => p.memberId === memberId);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      const hadController = !!navigator.serviceWorker.controller;
      let reloading = false;
      const useNewestWorker = () => {
        if (hadController && !reloading) {
          reloading = true;
          window.location.reload();
        }
      };
      navigator.serviceWorker.addEventListener("controllerchange", useNewestWorker);
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {});
      return () => navigator.serviceWorker.removeEventListener("controllerchange", useNewestWorker);
    }
  }, []);

  const flush = useCallback(async () => {
    if (busy.current || !navigator.onLine) return;
    const todo = pendingTicks().filter((p) => p.memberId === memberId);
    if (!todo.length) return;
    busy.current = true;
    setSyncing(true);
    let sent = 0;
    for (const p of todo) {
      try {
        await setCheckin({ taskId: p.taskId, date: p.date, done: p.done, tappedAt: p.tappedAt });
        dropTick(p); // sent (or refused as too old): either way it's handled
        sent++;
      } catch {
        break; // still offline, try again later
      }
    }
    busy.current = false;
    setSyncing(false);
    if (sent) router.refresh();
  }, [memberId, router]);

  useEffect(() => {
    const first = setTimeout(flush, 1000); // anything left over from last time
    const id = setInterval(flush, 30_000);
    window.addEventListener("online", flush);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("online", flush);
    };
  }, [flush]);

  if (online && !mine.length) return null;
  return (
    <div
      role="status"
      className={`mx-4 mb-2 rounded-2xl px-4 py-2 text-sm font-bold ${online ? "bg-sky-50 text-sky-800" : "bg-stone-800 text-white"}`}
    >
      {!online ? `📴 ${t("offline.banner")}` : syncing ? `🔄 ${t("offline.syncing")}` : `⏳ ${t("offline.waiting", { n: mine.length })}`}
      {!online && mine.length > 0 && <span className="block text-xs font-semibold opacity-80">{t("offline.waiting", { n: mine.length })}</span>}
    </div>
  );
}
