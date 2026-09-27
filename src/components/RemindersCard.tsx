"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions";
import { translator, type Lang } from "@/lib/i18n";

type Status = "checking" | "unsupported" | "insecure" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function detect(): Status {
  if (!window.isSecureContext) return "insecure";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  if (ios && !standalone) return "ios-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "checking";
}

/** `bare`: just the contents, for use inside a folding Section. */
export default function RemindersCard({ vapidPublicKey, lang = "en", bare = false }: { vapidPublicKey: string; lang?: Lang; bare?: boolean }) {
  const t = translator(lang);
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const s = detect();
    if (s !== "checking") {
      setStatus(s); // eslint-disable-line react-hooks/set-state-in-effect -- browser-only capability check
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "on" : "off"))
      .catch(() => setStatus("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    setNote("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const res = await savePushSubscription(JSON.parse(JSON.stringify(sub)));
      setStatus(res.ok ? "on" : "off");
      if (res.ok) await sendTestPush();
    } catch (e) {
      setNote(`Couldn't turn on reminders: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setStatus("off");
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    const { sent } = await sendTestPush();
    setNote(t(sent ? "rem.sent" : "rem.failed"));
    setBusy(false);
  }

  const messages: Partial<Record<Status, string>> = {
    insecure: t("rem.insecure"),
    "ios-install": t("rem.iosInstall"),
    unsupported: t("rem.unsupported"),
    denied: t("rem.denied"),
  };

  const Wrapper = bare ? "div" : "section";
  return (
    <Wrapper className={bare ? "" : "card"}>
      {!bare && <h2 className="mb-1 text-lg font-black">🔔 {t("rem.title")}</h2>}
      <p className="mb-4 text-sm text-muted">{t("rem.sub")}</p>
      {status === "checking" && <p className="text-sm text-muted">{t("rem.checking")}</p>}
      {messages[status] && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{messages[status]}</p>}
      {status === "off" && (
        <button onClick={turnOn} disabled={busy} className="btn w-full">
          {busy ? t("rem.turningOn") : t("rem.turnOn")}
        </button>
      )}
      {status === "on" && (
        <div className="space-y-2">
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{t("rem.on")}</p>
          <div className="flex gap-2">
            <button onClick={test} disabled={busy} className="btn-ghost flex-1 text-sm">
              {t("rem.test")}
            </button>
            <button onClick={turnOff} disabled={busy} className="btn-ghost flex-1 text-sm">
              {t("rem.off")}
            </button>
          </div>
        </div>
      )}
      {note && <p className="mt-2 text-sm font-semibold text-muted">{note}</p>}
    </Wrapper>
  );
}
