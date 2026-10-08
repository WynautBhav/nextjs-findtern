import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";
import { FileImage, FileText, Info, Video } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { EmptyScene, PageHead } from "@/components/app/primitives";

export const metadata: Metadata = {
  title: "Documents",
  robots: { index: false, follow: false },
};

/* Read-only for now.
 *
 * `intern_document` stores metadata only — name, MIME type, byte size. There is
 * no column holding the private-store key that `/api/uploads` returns, so this
 * page has nothing to link to: an "Open" button here would 404, and inventing a
 * permanent public URL for an Aadhaar image is the exact thing
 * `lib/security/store.ts` exists to prevent.
 *
 * Replacement uploads happen in the onboarding form, which posts to
 * `/api/uploads` and gets back a signed URL that dies in five minutes.
 */

type DocumentRow = {
  id: string;
  label: string;
  fileName: string;
  contentType: string | null;
  size: number | null;
  stampedAt: Date | null;
};

export default async function InternDocuments() {
  const session = await getSession();
  let rows: DocumentRow[] = [];
  try {
    const db = getDb();
    const [record] = await db
      .select()
      .from(schema.internDocuments)
      .where(eq(schema.internDocuments.userId, session!.uid))
      .orderBy(desc(schema.internDocuments.createdAt))
      .limit(1);

    rows = record ? flattenRecord(record) : [];
  } catch {
    // DB unavailable — render empty state rather than crashing the page.
  }

  return (
    <div>
      <PageHead
        title="Documents"
        lede="The identity files attached to your profile."
      />

      {rows.length === 0 ? (
        <EmptyScene
          art
          title="No documents uploaded"
          body="Profile photo, intro video, Aadhaar and PAN uploads will be listed here once they are added."
          next={{ label: "Add them in the profile editor", href: "/intern/onboarding" }}
        />
      ) : (
        <>
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-white">
            {rows.map((doc) => (
              <li key={doc.id} className="flex items-center gap-4 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <DocIcon contentType={doc.contentType} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-800">{doc.label}</p>
                  <p className="truncate text-xs text-text-subtle">{doc.fileName}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-text-subtle">
                  <p>{formatBytes(doc.size)}</p>
                  {doc.stampedAt ? (
                    <p className="mt-0.5">{formatDay(doc.stampedAt)}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-4 flex items-start gap-2 rounded-xl border border-info/20 bg-info-soft px-4 py-3 text-sm text-ink-700">
            <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            <span>
              Files live in private storage and are never served from a public URL.
              Only the metadata above is stored here — download links are minted per
              request and expire after five minutes.
            </span>
          </p>
        </>
      )}
    </div>
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
      label: slot.label,
      fileName: slot.name,
      contentType: slot.type,
      size: slot.size,
      stampedAt: record.updatedAt ?? record.createdAt ?? null,
    }));
}

function DocIcon({ contentType }: { contentType: string | null }) {
  const type = (contentType ?? "").toLowerCase();
  if (type.startsWith("video/")) return <Video className="size-4" aria-hidden />;
  if (type.startsWith("image/")) return <FileImage className="size-4" aria-hidden />;
  return <FileText className="size-4" aria-hidden />;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return "Size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDay(value: Date): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}