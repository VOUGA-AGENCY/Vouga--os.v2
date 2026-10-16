import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Vouga OS",
    short_name: "Vouga OS",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/vouga-black-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/vouga-black-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/vouga-black-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
