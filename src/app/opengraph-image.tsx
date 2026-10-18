import { ImageResponse } from "next/og";

export const alt = "Findtern: pre-screened interns, paid by the hour";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card for links to findtern.in (legacy shared logo.png only). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#041d17",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>Findtern</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            Interns screened before you meet them.
          </div>
          <div style={{ fontSize: 32, color: "#a7d9c5" }}>Coding, aptitude and interview tested. Billed only for approved hours.</div>
        </div>
      </div>
    ),
    size,
  );
}
