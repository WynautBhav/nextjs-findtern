import type { Metadata } from "next";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { Check, CircleAlert, ExternalLink, FileImage, FileText, Upload, Video } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageHead } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { DocImagePreview } from "@/components/intern/doc-preview";
import { certificateFiles } from "@/lib/onboarding";
import { guardPrecomplete } from "@/lib/intern-precomplete";

export const metadata: Metadata = {
  title: "Documents",
  robots: { index: false, follow: false },
};

/* Read-only. "View" links go through /intern/documents/open, which checks
 * ownership and mints a fresh signed URL per click, so links never go stale.
 * Replacement uploads happen in the onboarding form.
 */

type DocumentRow = {
  id: string;
  href: string;
  /** Stored file name or key, when it differs from the label shown. */
  key?: string;
  label: string;
  fileName: string;
  contentType: string | null;
  size: number | null;
  stampedAt: Date | null;
};

export default async function InternDocuments() {
  const session = await requireRole("intern");
  // Closed until the profile is complete (unpaid interns only); the layout's check does not run on a client-side move.
  await guardPrecomplete(session.uid, "/intern/documents");
  // No try/catch: a failed read shows the error state (app/intern/error.tsx),
  // never "No documents uploaded".
  const db = getDb();
  const [record] = await db
    .select()
    .from(schema.internDocuments)
    .where(eq(schema.internDocuments.userId, session.uid))
    .orderBy(desc(schema.internDocuments.createdAt))
    .limit(1);

  let rows: DocumentRow[] = record ? flattenRecord(record) : [];
  const [onboarding] = await db
    .select({ extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, session.uid))
    .limit(1);
  const academics = ((onboarding?.extra ?? {}) as Record<string, unknown>).academics as Record<string, unknown> | undefined;
  const sheets = Array.isArray(academics?.marksheetUploads) ? (academics.marksheetUploads as Record<string, unknown>[]) : [];
  sheets.forEach((m, i) => {
    const name = String(m.name ?? "");
    if (!name) return;
    rows.push({
      id: `marksheet-${i}`,
      href: "",
      label: "Marksheet",
      // Legacy stores `originalName`; older rows from this app used `label`.
      fileName: String(m.originalName || m.label || name.split("/").pop()),
      contentType: typeof m.type === "string" ? m.type : null,
      size: typeof m.size === "number" ? m.size : null,
      stampedAt: null,
      key: name,
    });
  });
  certificateFiles(academics).forEach((c, i) => {
    rows.push({
      id: `certificate-${i}`,
      href: "",
      label: c.label,
      fileName: c.originalName || c.name.split("/").pop() || c.name,
      contentType: c.type || null,
      size: c.size || null,
      stampedAt: null,
      key: c.name,
    });
  });
  rows = rows.map((r) => ({ ...r, href: `/intern/documents/open?key=${encodeURIComponent(r.key ?? r.fileName)}` }));

  // What every intern needs on file, in the order it matters: PAN (so payouts can go out), photo, Aadhaar.
  const REQUIRED = ["PAN", "Profile photo", "Aadhaar"];
  const have = (label: string) => rows.find((r) => r.label === label);
  const missing = REQUIRED.filter((l) => !have(l));
  const extras = rows.filter((r) => !REQUIRED.includes(r.label));
  const onFile = REQUIRED.length - missing.length;

  return (
    <div>
      <PageHead
        title="Documents"
        lede="The files attached to your profile. Only you and the Findtern team can open them."
        action={
          <ButtonLink href="/intern/onboarding" variant={missing.length > 0 ? "primary" : "outline"}>
            <Upload className="size-4" aria-hidden />
            {missing.length > 0 ? "Add missing files" : "Replace or add files"}
          </ButtonLink>
        }
      />

      <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="nums font-display text-4xl font-bold leading-none text-ink-900">
            {onFile}
            <span className="ml-1 text-base font-medium text-ink-600">of {REQUIRED.length} on file</span>
          </p>
          <p className="mt-3 max-w-xs text-pretty text-sm text-ink-700">
            {missing.length === 0
              ? "Everything your stipend and profile need is here. Employers never see these files."
              : `Still needed: ${missing.join(", ")}.${missing.includes("PAN") ? " Payouts cannot go out without your PAN image." : ""}`}
          </p>
        </div>

        <div className="min-w-0">
          <ul className="divide-y divide-ink-200 border-y border-ink-300">
            {REQUIRED.map((label) => {
              const doc = have(label);
              return doc ? <LedgerRow key={label} doc={doc} /> : <MissingRow key={label} label={label} />;
            })}
          </ul>
          {extras.length > 0 ? (
            <section className="mt-8" aria-labelledby="docs-more">
              <h2 id="docs-more" className="font-display text-lg font-semibold text-ink-900">
                Education and certificates
              </h2>
              <ul className="mt-3 divide-y divide-ink-200 border-y border-ink-300">
                {extras.map((doc) => (
                  <LedgerRow key={doc.id} doc={doc} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** One file on the ledger: a small preview, what it is, its state in words and an icon, and the one action. */
function LedgerRow({ doc }: { doc: DocumentRow }) {
  const type = (doc.contentType ?? "").toLowerCase();
  return (
    <li className="flex items-center gap-4 py-4">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200">
        {type.startsWith("image/") ? (
          <DocImagePreview href={doc.href} fit={doc.label === "Profile photo" ? "cover" : "contain"} />
        ) : (
          <DocIcon contentType={doc.contentType} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-ink-900">{doc.label}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-700">
          <span className="inline-flex items-center gap-1 font-medium text-brand-800">
            <Check className="size-4" strokeWidth={3} aria-hidden />
            On file
          </span>
          <span className="nums [overflow-wrap:anywhere]">
            {doc.fileName} · {formatBytes(doc.size)}
            {doc.stampedAt ? ` · ${formatDate(doc.stampedAt)}` : ""}
          </span>
        </p>
      </div>
      <a
        href={doc.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        View
        <ExternalLink className="size-3.5" aria-hidden />
        <span className="sr-only"> {doc.label} (opens in a new tab)</span>
      </a>
    </li>
  );
}

function MissingRow({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-4 py-4">
      <span className="grid size-14 shrink-0 place-items-center rounded-md border border-dashed border-ink-400 text-signal">
        <CircleAlert className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-ink-900">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-signal">Missing</p>
      </div>
      <Link
        href="/intern/onboarding"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        Add
        <span className="sr-only"> {label} in your profile</span>
      </Link>
    </li>
  );
}

/** A stored record groups up to four files under one row; present them as a list. */
function flattenRecord(record: typeof schema.internDocuments.$inferSelect): DocumentRow[] {
  const slots = [
    { label: "Profile photo", name: record.profilePhotoName, type: record.profilePhotoType, size: record.profilePhotoSize },
    { label: "Intro video", name: record.introVideoName, type: record.introVideoType, size: record.introVideoSize },
    { label: "Aadhaar", name: record.aadhaarImageName, type: record.aadhaarImageType, size: record.aadhaarImageSize },
    { label: "PAN", name: record.panImageName, type: record.panImageType, size: record.panImageSize },
  ];

  return slots
    .filter((slot): slot is { label: string; name: string; type: string | null; size: number | null } =>
      Boolean(slot.name),
    )
    .map((slot, i) => ({
      id: `${record.id}-${i}`,
      href: "",
      label: slot.label,
      // Identity slots keep only a storage key, not the original name.
      fileName: kindLabel(slot.type),
      key: slot.name,
      contentType: slot.type,
      size: slot.size,
      stampedAt: record.updatedAt ?? record.createdAt ?? null,
    }));
}

function kindLabel(type: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t.startsWith("image/")) return `${t.slice(6).toUpperCase()} image`;
  if (t.startsWith("video/")) return "Video";
  if (t === "application/pdf") return "PDF";
  return "File";
}

function DocIcon({ contentType }: { contentType: string | null }) {
  const type = (contentType ?? "").toLowerCase();
  if (type.startsWith("video/")) return <Video className="size-5" aria-hidden />;
  if (type.startsWith("image/")) return <FileImage className="size-5" aria-hidden />;
  return <FileText className="size-5" aria-hidden />;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return "Size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
