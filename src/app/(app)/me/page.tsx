import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { BREAK_REASONS, openBreaks } from "@/lib/data";
import { BADGES, STREAK_MIN, achievementsFor, finalizeEvents, standings, weekRecap } from "@/lib/stats";
import { vapidKeys } from "@/lib/push";
import { formatDate, startOfMonth, startOfWeek, today } from "@/lib/dates";
import { LANGS, translator } from "@/lib/i18n";
import { changeMyPin, endBreak, logout, savePrefs, startBreak, updateMyPhoto } from "@/app/actions";
import ActionForm, { SubmitButton } from "@/components/ActionForm";
import Avatar, { photoUrl } from "@/components/Avatar";
import BadgeGrid from "@/components/BadgeGrid";
import BreakFields from "@/components/BreakFields";
import Coin from "@/components/Coin";
import LogoutButton from "@/components/LogoutButton";
import PhotoPicker from "@/components/PhotoPicker";
import RemindersCard from "@/components/RemindersCard";
import Section, { SubSection } from "@/components/Section";
import RecapCard from "@/components/RecapCard";

const chip =
  "flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-white py-3 font-bold text-muted transition has-[:checked]:border-brand has-[:checked]:bg-orange-50 has-[:checked]:text-brand-dark";

export default async function MePage() {
  const me = await requireMember();
  const t = translator(me.lang);
  const date = today();
  const short = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short" }, me.lang);
  await finalizeEvents();
  const [board, ach, breaks, vapid, recap] = await Promise.all([
    standings(startOfMonth(date), date),
    achievementsFor(me.id),
    openBreaks(me.id),
    vapidKeys(),
    weekRecap(me.id, startOfWeek(date), date),
  ]);
  const month = board.find((s) => s.member.id === me.id);
  const current = breaks.find((b) => b.start_date <= date);
  const earnedEmojis = ach.badges.map((b) => BADGES.find((x) => x.id === b.id)!.emoji).join(" ");

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center pt-2 text-center">
        <Avatar member={me} size={96} />
        <h1 className="mt-3 text-2xl font-black">{me.name}</h1>
        {month && month.score !== null && (
          <p className="mt-1 font-bold text-muted">
            {t("me.thisMonth", { pct: `${Math.round(month.score)}%`, n: month.done })}
            {month.rank > 0 && ` · ${t("me.rank", { n: month.rank })}`}
          </p>
        )}
      </div>

      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="card p-3" title={t("today.streakHint", { min: STREAK_MIN })}>
          <p className="text-2xl font-black">🔥 {ach.streak.current}</p>
          <p className="text-xs font-bold text-muted">{t("me.streak")}</p>
        </div>
        <div className="card p-3">
          <p className="text-2xl font-black">🏆 {ach.streak.best}</p>
          <p className="text-xs font-bold text-muted">{t("me.best")}</p>
        </div>
        <Link href="/shop" className="card p-3">
          <p className="flex items-center justify-center gap-1.5 text-2xl font-black">
            <Coin size={24} className="coin-shine" /> {ach.coins}
          </p>
          <p className="text-xs font-bold text-muted">{t("me.coins")}</p>
        </Link>
      </section>

      {!!me.default_pin && (
        <a href="#pin" className="block rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          🔑 {t("me.defaultPin")}
        </a>
      )}

      <Section
        icon="📊"
        title={t("me.myWeek")}
        hint={recap.score === null ? t("recap.none") : `${Math.round(recap.score)}% · ${t("lb.done", { done: recap.done, total: recap.scheduled })}`}
      >
        <RecapCard recap={recap} lang={me.lang} bare />
      </Section>

      <Section icon="🏅" title={t("me.badges")} hint={earnedEmojis || t("me.hint.badges", { n: 0, total: BADGES.length })} badge={<Count n={ach.badges.length} of={BADGES.length} />}>
        <p className="mb-3 text-sm text-muted">{t("me.badgesSub", { n: ach.badges.length, total: BADGES.length, min: STREAK_MIN })}</p>
        <BadgeGrid earned={ach.badges} lang={me.lang} />
      </Section>

      <Section
        id="settings"
        icon="⚙️"
        title={t("me.settings")}
        hint={current ? `${BREAK_REASONS[current.reason].emoji} ${t("me.hint.onBreak", { date: short(current.end_date) })}` : t("me.settingsHint")}
      >
        <SubSection
          id="break"
          icon={current ? BREAK_REASONS[current.reason].emoji : "🤒"}
          title={t("me.breakTitle")}
          hint={
            current
              ? t("me.hint.onBreak", { date: short(current.end_date) })
              : breaks[0]
                ? t("me.hint.upcoming", { date: short(breaks[0].start_date) })
                : t("me.hint.noBreak")
          }
        >
          <p className="mb-4 text-sm text-muted">{t("me.breakSub")}</p>
          {breaks.length > 0 ? (
            <ul className="space-y-2">
              {breaks.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-stone-50 p-3">
                  <span className="text-2xl">{BREAK_REASONS[b.reason].emoji}</span>
                  <span className="flex-1 text-sm">
                    <b>{t(b.reason === "sick" ? "reason.sick" : "reason.travel")}</b>
                    <br />
                    {b.start_date === b.end_date ? short(b.start_date) : `${short(b.start_date)} – ${short(b.end_date)}`}
                  </span>
                  <ActionForm action={endBreak}>
                    <input type="hidden" name="id" value={b.id} />
                    <SubmitButton className="btn-ghost text-sm" pendingText="…">
                      {b.start_date > date ? t("me.cancelBreak") : t("me.backBreak")}
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <ActionForm action={startBreak}>
              <BreakFields today={date} lang={me.lang} />
              <SubmitButton className="btn mt-4 w-full">{t("me.startBreak")}</SubmitButton>
            </ActionForm>
          )}
        </SubSection>

        <SubSection id="reminders" icon="🔔" title={t("rem.title")} hint={t("me.hint.remind")}>
          <RemindersCard vapidPublicKey={vapid.publicKey} lang={me.lang} bare />
        </SubSection>

        <SubSection
          icon="🔠"
          title={t("me.display")}
          hint={t("me.hint.display", {
            lang: LANGS.find((l) => l.value === me.lang)!.label,
            size: t(me.text_size === "large" ? "me.large" : "me.normal"),
          })}
        >
          <ActionForm action={savePrefs} className="space-y-4">
            <fieldset>
              <legend className="label">{t("me.language")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {LANGS.map((l) => (
                  <label key={l.value} className={chip}>
                    <input type="radio" name="lang" value={l.value} defaultChecked={me.lang === l.value} className="sr-only" />
                    {l.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">{t("me.textSize")}</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className={chip}>
                  <input type="radio" name="text_size" value="normal" defaultChecked={me.text_size !== "large"} className="sr-only" />
                  <span className="text-sm">A</span> {t("me.normal")}
                </label>
                <label className={chip}>
                  <input type="radio" name="text_size" value="large" defaultChecked={me.text_size === "large"} className="sr-only" />
                  <span className="text-xl">A</span> {t("me.large")}
                </label>
              </div>
            </fieldset>
            <SubmitButton className="btn w-full">{t("me.save")}</SubmitButton>
          </ActionForm>
        </SubSection>

        <SubSection icon="📷" title={t("me.photo")} hint={t("me.hint.photo")}>
          <ActionForm action={updateMyPhoto}>
            <PhotoPicker current={photoUrl(me)} lang={me.lang} />
            <SubmitButton className="btn mt-4 w-full">{t("me.savePhoto")}</SubmitButton>
          </ActionForm>
        </SubSection>

        <SubSection
          id="pin"
          icon="🔒"
          title={t("me.pinTitle")}
          hint={t("me.hint.pin")}
          badge={me.default_pin ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">0000</span> : undefined}
        >
          <ActionForm action={changeMyPin} resetOnSuccess className="space-y-3">
            {(
              [
                ["current", "me.pinCurrent"],
                ["pin", "me.pinNew"],
                ["pin2", "me.pinRepeat"],
              ] as const
            ).map(([name, label]) => (
              <div key={name}>
                <label className="label" htmlFor={`pin-${name}`}>
                  {t(label)}
                </label>
                <input id={`pin-${name}`} name={name} type="password" inputMode="numeric" pattern="\d{4,6}" required maxLength={6} className="field tracking-[0.4em]" />
              </div>
            ))}
            <SubmitButton className="btn w-full">{t("me.pinSave")}</SubmitButton>
          </ActionForm>
        </SubSection>

        <SubSection icon="📱" title={t("me.homeTitle")} hint={t("me.hint.home")}>
          <div className="space-y-1 text-sm text-muted">
            <p>{t("me.homeIphone")}</p>
            <p>{t("me.homeAndroid")}</p>
          </div>
        </SubSection>
      </Section>

      <div className="pt-2">
        <LogoutButton action={logout} label={t("me.logout")} />
      </div>
    </div>
  );
}

function Count({ n, of }: { n: number; of: number }) {
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-black text-amber-800">
      {n}/{of}
    </span>
  );
}
