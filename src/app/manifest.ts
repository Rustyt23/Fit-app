import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Family Fit",
    short_name: "Family Fit",
    description: "Our family's exercise, supplement and medicine routines, with a daily ranking.",
    start_url: "/today",
    display: "standalone",
    background_color: "#fff8f0",
    theme_color: "#fff8f0",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
