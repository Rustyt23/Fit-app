"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { login } from "@/app/actions";
import type { Member } from "@/lib/data";
import Avatar from "@/components/Avatar";
import { translator, type Lang } from "@/lib/i18n";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "go"];

export default function LoginPicker({ members, lang }: { members: Member[]; lang: Lang }) {
  const t = translator(lang);
  const [picked, setPicked] = useState<Member | null>(members.length === 1 ? members[0] : null);
  const [pin, setPin] = useState("");
  const [state, action, pending] = useActionState(login, undefined);

  function press(key: string) {
    if (pending || !picked) return;
    if (key === "back") return setPin((p) => p.slice(0, -1));
    if (key === "go") {
      if (pin.length < 4) return;
      const fd = new FormData();
      fd.set("memberId", String(picked.id));
      fd.set("pin", pin);
      setPin(""); // cleared either way: success navigates away, a wrong PIN starts over
      return startTransition(() => action(fd));
    }
    setPin((p) => (p.length < 6 ? p + key : p));
  }

  // Forget the previous person's saved offline page on this phone.
  useEffect(() => {
    navigator.serviceWorker?.controller?.postMessage("clear-cache");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter") press("go");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!picked) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => setPicked(m)}
            className="card flex flex-col items-center gap-3 py-6 transition active:scale-95"
          >
            <Avatar member={m} size={88} />
            <span className="text-lg font-extrabold">{m.name}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <Avatar member={picked} size={104} />
      <p className="mt-3 text-xl font-extrabold">{t("login.hi", { name: picked.name })}</p>
      <p className="text-muted">{t("login.enterPin")}</p>

      <div className="my-6 flex h-5 gap-3" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full transition ${i < pin.length ? "scale-110 bg-brand" : "bg-line"}`}
          />
        ))}
      </div>

      {state?.error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          {state.error}
        </p>
      )}

      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            disabled={pending || (k === "go" && pin.length < 4)}
            className={`h-16 rounded-2xl text-2xl font-extrabold transition active:scale-95 disabled:opacity-40 ${
              k === "go" ? "bg-brand text-white" : "bg-white shadow-sm"
            }`}
            aria-label={k === "back" ? t("login.delete") : k === "go" ? t("login.go") : k}
          >
            {k === "back" ? "⌫" : k === "go" ? (pending ? "…" : "→") : k}
          </button>
        ))}
      </div>

      {members.length > 1 && (
        <button
          onClick={() => {
            setPicked(null);
            setPin("");
          }}
          className="mt-6 text-sm font-bold text-muted underline"
        >
          {t("login.notYou", { name: picked.name })}
        </button>
      )}
    </div>
  );
}
