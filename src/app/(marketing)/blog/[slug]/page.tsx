import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { CopyLink } from "@/components/marketing/copy-link";
import { getBlogPost, getBlogPosts } from "@/lib/content";
import { plainTextExcerpt, readingMinutes, sanitizeRichText } from "@/lib/richtext";
import { tidyText } from "@/lib/text";
import { JsonLd } from "@/components/seo/json-ld";
import { blogPostingJsonLd, breadcrumbJsonLd } from "@/lib/seo";

/* Slugs are the published, indexed ones - `Intern-10`, `Employer-12` and so on.
   Renaming them would break every existing link, so they are preserved exactly
   as the CMS has them. */

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) return { title: "Not found" };

  const title = tidyText(post.title);
  const description = plainTextExcerpt(post.body, 155);

  return {
    title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: post.publishedAt,
      modifiedTime: post.publishedAt,
      authors: ["Findtern"],
      section: post.slug.toLowerCase().startsWith("employer") ? "For employers" : "For interns",
      url: `/blog/${post.slug}`,
      // The generated title card (opengraph-image.tsx beside this file) is
      // the share image; CMS covers are inline base64 of assorted sizes.
    },
  };
}

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  const all = await getBlogPosts();
  const related = all.filter((p) => p.slug !== post.slug).slice(0, 3);

  const title = tidyText(post.title);
  const clean = sanitizeRichText(post.body);
  const minutes = readingMinutes(post.body);
  const hero = post.bannerImageUrl ?? post.coverImageUrl;

  return (
    <>
      <JsonLd
        data={[
          blogPostingJsonLd(post),
          breadcrumbJsonLd([
            { name: "Blog", path: "/blog" },
            { name: title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
      {/* ── Article header ────────────────────────────────────────── */}
      <header className="relative isolate overflow-hidden border-b border-ink-100 bg-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_15%_-10%,rgb(14_96_73/0.07)_0%,transparent_62%)]"
        />
        <div className="container-page relative py-12 sm:py-16">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-4" aria-hidden />
            All posts
          </Link>

          <div className="mt-8 max-w-3xl">
            <span className="inline-flex rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-2xs font-semibold uppercase tracking-[0.12em] text-primary">
              Findtern
            </span>
            <h1 className="mt-5 text-balance text-[clamp(2rem,4.4vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-ink-900">
              {title}
            </h1>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-600">
              <span>
                By <span className="font-medium text-ink-700">the Findtern team</span>
              </span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-ink-300" />
              <time dateTime={post.publishedAt}>
                {new Date(post.publishedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
              <span aria-hidden className="h-1 w-1 rounded-full bg-ink-300" />
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-3.5" aria-hidden />
                {minutes} min read
              </span>
              <CopyLink />
            </div>
          </div>

          {hero ? (
            <div className="mt-10 max-w-4xl overflow-hidden rounded-2xl border border-ink-100 bg-ink-100">
              {/* Banners range from square to 3:1 and some carry text, so they
                  keep their own aspect ratio rather than being cropped. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- served and cached by /api/blog-image */}
              <img src={hero} alt={title} decoding="async" fetchPriority="high" className="block h-auto w-full" />
            </div>
          ) : null}
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div className="container-page grid gap-12 py-14 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
        <article className="prose-rt min-w-0 max-w-2xl">
          {/* The only place on the site that renders CMS HTML, and it goes
              through the allowlist sanitiser in lib/richtext.ts first. The
              legacy build used a four-item regex here. */}
          <div dangerouslySetInnerHTML={{ __html: clean }} />
        </article>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-2xl border border-ink-200 bg-ink-50 p-5">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-600">
              Related
            </p>
            <ul className="mt-3 space-y-1">
              {related.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/blog/${r.slug}`}
                    className="flex items-start gap-3 py-1 text-sm font-medium leading-snug text-ink-700 transition-colors hover:text-primary"
                  >
                    {r.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- served and cached by /api/blog-image
                      <img
                        src={r.coverImageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="size-12 shrink-0 rounded-lg border border-ink-200 object-cover"
                      />
                    ) : null}
                    {tidyText(r.title)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 rounded-2xl border border-brand-200 bg-brand-50 p-5">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-primary">
              Get assessed
            </p>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-600">
              One assessment, one published score, and the rate that follows
              from it.
            </p>
            <ButtonLink href="/signup" size="sm" block className="mt-4">
              Start
            </ButtonLink>
          </div>
        </aside>
      </div>
    </>
  );
}

