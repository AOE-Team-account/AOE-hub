import type { MetadataRoute } from "next";

// Lets a phone or tablet add the hub to the home screen with its own icon and name.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AOEhub — Alpha Omega Education",
    short_name: "AOEhub",
    description: "A free education hub for homeschool, unschool, and school families.",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F7F2",
    theme_color: "#3F6B4F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
