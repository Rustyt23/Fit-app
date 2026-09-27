/** A shiny gold coin, drawn with CSS so it looks the same on every phone (the 🪙 emoji is silver on some). */
export default function Coin({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`coin ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.56, borderWidth: Math.max(1, size * 0.07) }}
    >
      ★
    </span>
  );
}

/** Coin icon followed by an amount, e.g. [coin] 150. */
export function CoinAmount({
  value,
  size = 16,
  light = false,
  className = "",
}: {
  value: number;
  size?: number;
  /** White text, for use on coloured buttons. */
  light?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 align-middle font-black ${light ? "text-white" : "text-amber-800"} ${className}`}>
      <Coin size={size} />
      {value}
    </span>
  );
}
