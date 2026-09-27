"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Coin from "./Coin";
import { translator, type Lang } from "@/lib/i18n";

export default function BottomNav({ isAdmin, lang }: { isAdmin: boolean; lang: Lang }) {
  const path = usePathname();
  const t = translator(lang);
  const items: { href: string; label: string; icon: ReactNode }[] = [
    { href: "/today", label: t("nav.today"), icon: "✅" },
    { href: "/leaderboard", label: t("nav.ranking"), icon: "🏆" },
    { href: "/family", label: t("nav.family"), icon: "👨‍👩‍👧" },
    { href: "/shop", label: t("nav.shop"), icon: <Coin size={21} /> },
    ...(isAdmin ? [{ href: "/admin", label: t("nav.admin"), icon: "🛠️" }] : []),
    { href: "/me", label: t("nav.me"), icon: "🙂" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-xl">
        {items.map((item) => {
          const active = path === item.href || path.startsWith(item.href + "/");
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold leading-tight ${active ? "text-ink" : "text-muted"}`}
              >
                <span className={`grid h-7 place-items-center text-xl transition ${active ? "scale-110" : "opacity-70 grayscale"}`}>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
