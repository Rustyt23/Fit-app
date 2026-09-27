"use client";

/** If logging in fails (e.g. the connection dropped), offer a fresh start instead of a stuck screen. */
export default function LoginError() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl">📶</p>
      <p className="text-lg font-extrabold">Couldn&apos;t reach Family Fit / Family Fit से जुड़ नहीं पाए</p>
      <a href="/login" className="btn">
        Try again / फिर से कोशिश करें
      </a>
    </main>
  );
}
