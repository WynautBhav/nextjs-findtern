import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getBlogPost, getBlogPosts } from "@/lib/content";
import { readingMinutes } from "@/lib/richtext";
import { tidyText } from "@/lib/text";

/**
 * Per-post social card: the title on the brand wash. The CMS cover images
 * are inline base64 of assorted sizes, so a generated card gives every post a
 * clean 1200×630 preview regardless of what was uploaded.
 */
export const alt = "Findtern blog post";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [post, semiBold, regular, logo] = await Promise.all([
    getBlogPost(slug),
    readFile(join(process.cwd(), "src/assets/fonts/Poppins-SemiBold.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/Poppins-Regular.ttf")),
    readFile(join(process.cwd(), "public/media/logo-remove.png")),
  ]);
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  const title = post ? tidyText(post.title) : "Findtern Blog";
  const minutes = post ? readingMinutes(post.body) : null;
  const fontSize = title.length > 90 ? 44 : title.length > 60 ? 52 : 62;

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
          backgroundImage: "radial-gradient(ellipse 70% 60% at 15% -10%, rgba(22,107,84,0.7), transparent 70%)",
          color: "white",
          fontFamily: "Poppins",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori needs a plain img */}
          <img src={logoSrc} alt="" width={180} height={87} style={{ filter: "brightness(0) invert(1)", objectFit: "contain" }} />
          <span style={{ fontSize: 22, color: "#F5BB63", letterSpacing: "0.14em", textTransform: "uppercase" }}>Blog</span>
        </div>

        <div style={{ display: "flex", fontSize, fontWeight: 600, lineHeight: 1.1, letterSpacing: "-0.025em", maxWidth: 1000 }}>
          {title}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#A8BDB3" }}>
          <span>findtern.in/blog</span>
          {minutes ? <span>{minutes} min read</span> : null}
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
