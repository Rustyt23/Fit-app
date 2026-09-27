import Link from "next/link";

/** A friendly "nothing here yet" card: a small drawing, one line of text, and at most one button. */
export default function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-8 text-center">
      <svg viewBox="0 0 160 120" className="h-28 w-36" aria-hidden>
        <circle cx="80" cy="62" r="54" fill="#fff1e3" />
        {/* sun */}
        <circle cx="122" cy="30" r="12" fill="var(--color-gold)" />
        <g stroke="var(--color-gold)" strokeWidth="3" strokeLinecap="round">
          <path d="M122 10v-4M122 54v-4M102 30h-4M146 30h-4M108 16l-3-3M139 47l-3-3M108 44l-3 3M139 13l-3 3" />
        </g>
        {/* sprout */}
        <path d="M80 86V52" stroke="var(--color-supplement)" strokeWidth="4" strokeLinecap="round" />
        <path d="M80 62c-16 0-24-10-24-22 14 0 24 8 24 22z" fill="var(--color-supplement)" />
        <path d="M80 56c14 0 22-9 22-19-12 0-22 7-22 19z" fill="#34d399" />
        {/* pot */}
        <path d="M58 84h44l-6 26H64z" fill="var(--color-brand)" />
        <rect x="54" y="80" width="52" height="9" rx="4" fill="#fb923c" />
      </svg>
      <p className="mt-2 text-lg font-black">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-muted">{text}</p>}
      {action && (
        <Link href={action.href} className="btn mt-4">
          {action.label}
        </Link>
      )}
    </div>
  );
}
