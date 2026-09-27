import { ImageResponse } from "next/og";

/** App icon: a white heart on a warm gradient, drawn with SVG so no fonts or network are needed. */
export function iconResponse(size: number, rounded = false) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fb923c, #f43f5e)",
          borderRadius: rounded ? size * 0.22 : 0,
        }}
      >
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
          <path
            fill="white"
            d="M12 21s-7.5-4.6-9.6-9.3C1 8.2 3.3 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.7 0 6 3.7 4.6 7.2C19.5 16.4 12 21 12 21z"
          />
          <path d="M5 12.5h3.5l1.5-3 2.5 6 1.8-3.5H19" fill="none" stroke="#f97316" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
