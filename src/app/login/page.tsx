import { connection } from "next/server";
import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { activeMembers, familyName, memberCount } from "@/lib/data";
import LoginPicker from "./LoginPicker";
import { readPrefs } from "@/lib/prefs";
import { translator } from "@/lib/i18n";

export default async function LoginPage() {
  await connection(); // read the database on every request, not once at build time
  if ((await memberCount()) === 0) redirect("/setup");
  if (await currentMember()) redirect("/today");
  const { lang } = await readPrefs();
  const t = translator(lang);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-brand">{await familyName()}</p>
        <h1 className="mt-1 text-3xl font-black">{t("login.who")}</h1>
      </div>
      <LoginPicker members={await activeMembers()} lang={lang} />
    </main>
  );
}
