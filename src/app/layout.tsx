import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { readPrefs } from "@/lib/prefs";
import { currentMember } from "@/lib/auth";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Family Fit",
  description: "Track the family's exercise, supplements and medicines, and see who's leading today.",
  appleWebApp: { capable: true, title: "Family Fit", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#fff8f0",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Language and large text: the logged-in person's own settings, or (on the login
  // screen) whoever last used this phone.
  const me = await currentMember();
  const prefs = me ? { lang: me.lang, large: me.text_size === "large" } : await readPrefs();
  return (
    <html lang={prefs.lang} className={`${nunito.variable} h-full antialiased ${prefs.large ? "text-large" : ""}`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
