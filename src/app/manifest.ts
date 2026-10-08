import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Findtern",
    short_name: "Findtern",
    description: "Hire pre-vetted interns at unbeatable prices.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0e6049",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
