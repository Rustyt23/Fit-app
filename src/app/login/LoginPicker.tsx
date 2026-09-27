"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { login } from "@/app/actions";
import type { Member } from "@/lib/data";
import Avatar from "@/components/Avatar";
import { translator, type Lang } from "@/lib/i18n";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "go"];

const noop = () => () => {};
/** False in the server's HTML and until this page's JavaScript is running; true after. */
const useInteractive = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Pick your photo, then enter your PIN. Built so it still works if the page's JavaScript
 * never starts (a slow phone, an out-of-date page): the photos are links, the PIN keypad
 * sits in a real form, and there's a real PIN box the phone's own keyboard can fill.
 */
export default function LoginPicker({ members, lang, initialId }: { members: Member[]; lang: Lang; initialId?: number }) {
  const t = translator(lang);
  const [picked, setPicked] = useState<Member | null>(
    members.find((m) => m.id === initialId) ?? (members.length === 1 ? members[0] : null),
  );
  const [pin, setPin] = useState("");
  const interactive = useInteractive();
  // The server action itself (not a wrapper), so the form also works before/without JavaScript.
  const [state, formAction, pending] = useActionState(login, undefined);
  // A wrong PIN starts over (checked while rendering, when a new answer arrives).
  const [answered, setAnswered] = useState(state);
  if (state !== answered) {
    setAnswered(state);
    if (state?.error) setPin("");
  }

  function press(key: string) {
    if (pending || !picked) return;
    if (key === "back") return setPin((p) => p.slice(0, -1));
    setPin((p) => (p.length < 6 ? p + key : p));
  }

  // Forget the previous person's saved offline page on this phone.
  useEffect(() => {
    navigator.serviceWorker?.controller?.postMessage("clear-cache");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return; // typing in the PIN box itself
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter" && pin.length >= 4) (document.getElementById("login-form") as HTMLFormElement | null)?.requestSubmit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!picked) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {members.map((m) => (
          <a
            key={m.id}
            href={`/login?m=${m.id}`}
            onClick={(e) => {
              e.preventDefault();
              setPicked(m);
            }}
            className="card flex flex-col items-center gap-3 py-6 transition active:scale-95"
          >
            <Avatar member={m} size={88} />
            <span className="text-lg font-extrabold">{m.name}</span>
          </a>
        ))}
      </div>
    );
  }

  return (
    <form id="login-form" action={formAction} className="flex flex-col items-center">
      <input type="hidden" name="memberId" value={picked.id} />
      <Avatar member={picked} size={104} />
      <p className="mt-3 text-xl font-extrabold">{t("login.hi", { name: picked.name })}</p>
      <label htmlFor="pin" className="text-muted">
        {t("login.enterPin")}
      </label>

      {/* The dots are the real PIN box: the keypad fills it, or tap it to use the phone's keyboard. */}
      <input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="\d{4,6}"
        minLength={4}
        maxLength={6}
        required
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="my-5 w-44 rounded-2xl border-2 border-line bg-white py-2 text-center text-3xl tracking-[0.5em] outline-none focus:border-brand"
        aria-label={t("login.enterPin")}
      />

      {state?.error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          {state.error}
        </p>
      )}

      {!interactive && (
        <>
          <p className="mb-3 text-sm font-bold text-muted">{t("login.typePin")}</p>
          <button type="submit" className="h-14 w-full max-w-xs rounded-2xl bg-brand text-lg font-extrabold text-white">
            {t("login.go")} →
          </button>
        </>
      )}

      <div className={`grid w-full max-w-xs grid-cols-3 gap-3 ${interactive ? "" : "hidden"}`}>
        {KEYS.map((k) =>
          k === "go" ? (
            <button
              key={k}
              type="submit"
              disabled={pending}
              className="h-16 rounded-2xl bg-brand text-2xl font-extrabold text-white transition active:scale-95 disabled:opacity-40"
              aria-label={t("login.go")}
            >
              {pending ? "…" : "→"}
            </button>
          ) : (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              disabled={pending}
              className="h-16 rounded-2xl bg-white text-2xl font-extrabold shadow-sm transition active:scale-95 disabled:opacity-40"
              aria-label={k === "back" ? t("login.delete") : k}
            >
              {k === "back" ? "⌫" : k}
            </button>
          ),
        )}
      </div>

      {members.length > 1 && (
        <a
          href="/login"
          onClick={(e) => {
            e.preventDefault();
            setPicked(null);
            setPin("");
          }}
          className="mt-6 text-sm font-bold text-muted underline"
        >
          {t("login.notYou", { name: picked.name })}
        </a>
      )}
    </form>
  );
}
