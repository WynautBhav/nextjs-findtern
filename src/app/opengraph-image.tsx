import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SITE } from "@/lib/content/site";

/**
 * Default social card. Generated at build time; every page without its own
 * opengraph-image inherits it, so a shared link never shows a blank preview.
 * Poppins is read from the repo (OFL) because the satori renderer cannot use
 * the next/font bundle.
 */
export const alt = "Findtern - hire an intern for the price of a coffee";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [semiBold, regular, logo] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/fonts/Poppins-SemiBold.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/Poppins-Regular.ttf")),
    readFile(join(process.cwd(), "public/media/logo-remove.png")),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#041D17",
          backgroundImage: "radial-gradient(ellipse 70% 60% at 50% -10%, rgba(22,107,84,0.7), transparent 70%)",
          color: "white",
          fontFamily: "Poppins",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- satori needs a plain img */}
        <img src={logoSrc} alt="" width={236} height={114} style={{ filter: "brightness(0) invert(1)", objectFit: "contain" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Two stacked lines: satori does not wrap text across sibling spans. */}
          <div style={{ display: "flex", flexDirection: "column", fontSize: 72, fontWeight: 600, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
            <div>Hire an intern for</div>
            <div style={{ color: "#F5BB63" }}>the price of a coffee.</div>
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 400, color: "#A8BDB3", maxWidth: 900 }}>
            Interviewed, tested and scored before you see them. Published rates, paid engagements.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#A8BDB3" }}>
          <span>{SITE.url.replace(/^https?:\/\//, "")}</span>
          <span>{SITE.tagline}</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Poppins", data: semiBold, weight: 600, style: "normal" },
        { name: "Poppins", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}
