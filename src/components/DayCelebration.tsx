"use client";

import { useEffect } from "react";

const COLORS = ["#f97316", "#f5b000", "#10b981", "#6366f1", "#ec4899", "#0ea5e9"];

/** A short burst of confetti, drawn on a temporary canvas (no library needed). */
function confetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60";
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const w = window.innerWidth;
  const pieces = Array.from({ length: 140 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 80,
    y: window.innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 12 - 4,
    size: 5 + Math.random() * 6,
    spin: Math.random() * Math.PI,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const start = performance.now();
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, w, window.innerHeight);
    for (const p of pieces) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.spin += 0.15;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < 2600) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Celebrates (once a day, per person, per phone) when the whole day's routine is done. */
export default function DayCelebration({ done, date, memberId }: { done: boolean; date: string; memberId: number }) {
  useEffect(() => {
    if (!done) return;
    const key = `ff_celebrated_${memberId}_${date}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      // storage blocked: celebrate anyway
    }
    navigator.vibrate?.([30, 60, 30]);
    confetti();
  }, [done, date, memberId]);
  return null;
}
