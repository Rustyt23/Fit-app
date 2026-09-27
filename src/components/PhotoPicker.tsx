"use client";

import { useRef, useState } from "react";
import { translator, type Lang } from "@/lib/i18n";

const SIZE = 320;

/** Crops the chosen image to a square, shrinks it, and puts it in a hidden `photo` field as a JPEG data URL. */
export default function PhotoPicker({ current, name = "photo", lang = "en" }: { current?: string | null; name?: string; lang?: Lang }) {
  const t = translator(lang);
  const label = t("photo.add");
  const [data, setData] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const side = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = SIZE;
      canvas.getContext("2d")!.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        SIZE,
        SIZE,
      );
      setData(canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      alert("Sorry, that photo couldn't be read. Try a JPG or PNG.");
    } finally {
      setBusy(false);
    }
  }

  const preview = data || current;
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-orange-300 bg-orange-50 text-3xl"
        aria-label={label}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>📷</span>
        )}
        {busy && <span className="absolute inset-0 grid place-items-center bg-white/70 text-sm">…</span>}
      </button>
      <div>
        <button type="button" onClick={() => input.current?.click()} className="btn-ghost text-sm">
          {preview ? t("photo.change") : label}
        </button>
        <p className="mt-1 text-xs text-muted">{t("photo.hint")}</p>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <input type="hidden" name={name} value={data} />
    </div>
  );
}
