import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { familyName } from "@/lib/data";
import Avatar from "@/components/Avatar";
import BottomNav from "@/components/BottomNav";
import OfflineSync from "@/components/OfflineSync";
import HashOpener from "@/components/HashOpener";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-cream/90 px-4 py-3 backdrop-blur">
        <Link href="/today" className="text-lg font-black">
          <span className="text-brand">●</span> {await familyName()}
        </Link>
        <Link href="/me" aria-label="My profile">
          <Avatar member={me} size={36} />
        </Link>
      </header>
      <OfflineSync memberId={me.id} lang={me.lang} />
      <HashOpener />
      <main className="flex-1 px-4 pb-28 pt-2">{children}</main>
      <BottomNav isAdmin={!!me.is_admin} lang={me.lang} />
    </div>
  );
}
