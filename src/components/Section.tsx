import type { ReactNode } from "react";

type Props = {
  icon: ReactNode;
  title: ReactNode;
  /** One line shown while closed, so you know what's inside without opening it. */
  hint?: ReactNode;
  /** Something small on the right, e.g. a count or a status chip. */
  badge?: ReactNode;
  defaultOpen?: boolean;
  /** Lets links like /me#pin open this section (see HashOpener). */
  id?: string;
  /** "add" draws it as a dashed "+ Add …" button while closed; "alert" gives it an orange border (needs you). */
  variant?: "card" | "add" | "alert";
  children: ReactNode;
};

/** A card that folds away. Uses <details>, so it works without JavaScript. */
export default function Section({ icon, title, hint, badge, defaultOpen, id, variant = "card", children }: Props) {
  const closed =
    variant === "add"
      ? "border-2 border-dashed border-orange-200 bg-orange-50/40 shadow-none open:border-solid open:border-line open:bg-white"
      : variant === "alert"
        ? "border-2 border-orange-300"
        : "";
  return (
    <details id={id} open={defaultOpen} className={`card group/section scroll-mt-20 overflow-hidden p-0 ${closed}`}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-stone-100 text-xl">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-black leading-tight">{title}</span>
          {hint && <span className="mt-0.5 block truncate text-xs font-semibold text-muted">{hint}</span>}
        </span>
        {badge}
        <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-muted transition-transform group-open/section:rotate-180" aria-hidden>
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-4">{children}</div>
    </details>
  );
}

/** A lighter fold inside a Section, for grouping related settings ("Settings & more"). */
export function SubSection({ icon, title, hint, badge, id, children }: Omit<Props, "variant" | "defaultOpen">) {
  return (
    <details id={id} className="group/sub scroll-mt-20 border-t border-line first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="grid h-8 w-8 shrink-0 place-items-center text-lg">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold leading-tight">{title}</span>
          {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
        </span>
        {badge}
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted transition-transform group-open/sub:rotate-180" aria-hidden>
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="pb-4 pt-1">{children}</div>
    </details>
  );
}
