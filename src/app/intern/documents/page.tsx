import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";
import { FileImage, FileText, Info, Video } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { EmptyScene, PageHead, Surface } from "@/components/app/primitives";

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
  let rows: DocumentRow[] = [];
  try {
    const db = getDb();
    const [record] = await db
      .select()
      .from(schema.internDocuments)
      .where(eq(schema.internDocuments.userId, session.uid))
      .orderBy(desc(schema.internDocuments.createdAt))
      .limit(1);

    rows = record ? flattenRecord(record) : [];
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
        fileName: String(m.label || name.split("/").pop()),
        contentType: typeof m.type === "string" ? m.type : null,
        size: typeof m.size === "number" ? m.size : null,
        stampedAt: null,
        key: name,
      });
    });
    rows = rows.map((r) => ({ ...r, href: `/intern/documents/open?key=${encodeURIComponent(r.key ?? r.fileName)}` }));
  } catch {
    // DB unavailable - render empty state rather than crashing the page.
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
          body="Profile photo, Aadhaar and PAN uploads will be listed here once they are added."
          next={{ label: "Add them in the profile editor", href: "/intern/onboarding" }}
        />
      ) : (
        <>
          <Surface className="overflow-hidden p-0">
          <ul className="divide-y divide-ink-100">
            {rows.map((doc) => (
              <li key={doc.id} className="flex items-center gap-4 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-700">
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
                {doc.href ? (
                  <a
                    href={doc.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 shrink-0 items-center rounded-[10px] border border-ink-200 px-3 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                  >
                    View
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          </Surface>

          <p className="mt-4 flex items-start gap-2 text-sm text-text-subtle">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Only you and Findtern staff can open these.
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
      href: "",
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
