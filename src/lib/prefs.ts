import "server-only";
import { cookies } from "next/headers";
import { isLang, type Lang } from "./i18n";

// Language and text size are saved on the member, and mirrored in a cookie so the
// login screen (before anyone is logged in) and the page frame can use them too.
const COOKIE = "ff_prefs";

export type Prefs = { lang: Lang; large: boolean };

export async function readPrefs(): Promise<Prefs> {
  const [lang, size] = ((await cookies()).get(COOKIE)?.value ?? "").split("|");
  return { lang: isLang(lang) ? lang : "en", large: size === "large" };
}

export async function writePrefs(lang: string, textSize: string) {
  (await cookies()).set(COOKIE, `${isLang(lang) ? lang : "en"}|${textSize === "large" ? "large" : "normal"}`, {
    maxAge: 365 * 86400,
    sameSite: "lax",
    path: "/",
  });
}
