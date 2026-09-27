"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Opens the folded section a link points at (e.g. /me#break) and scrolls it into view. */
export default function HashOpener() {
  const path = usePathname();
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (el instanceof HTMLDetailsElement) {
        // Open it and any group it sits inside (e.g. PIN inside "Settings & more").
        for (let d: Element | null = el; d; d = d.parentElement?.closest("details") ?? null) {
          (d as HTMLDetailsElement).open = true;
        }
        el.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [path]);
  return null;
}
