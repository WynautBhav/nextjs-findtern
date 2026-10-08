/**
 * Upload audit.
 *
 * Catalues every file in the legacy uploads tree and classifies it by
 * sensitivity, so the migration has a manifest and so the count of exposed
 * identity documents is a measured number rather than an estimate.
 *
 * Run:  node --experimental-strip-types scripts/audit-uploads.ts [dir]
 *
 * ── The exposure being measured ───────────────────────────────────────
 *
 * server/index.ts:103 mounts the whole tree unauthenticated:
 *
 *   app.use("/uploads", express.static(uploadsDir, { fallthrough: false }))
 *
 * and upload handlers hand the resulting URL back to the client
 * (routes.ts:4044 builds `/uploads/company-logos/...` and returns it).
 *
 * So the URL is the credential. It persists in browser history, in Referer
 * headers, and in any screenshot. And obtaining one is easy: the IDOR in
 * `/api/interns/:internId` returns another intern's stored document filenames
 * to any authenticated intern, which converts the UUID in the path from
 * unguessable into handed-over.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const ROOT = process.argv[2] ?? "/home/wynautbhav/FindTern/uploads";

type Sensitivity = "identity" | "academic" | "public";

/**
 * Classified by directory, which is what the multer `destination` callbacks
 * key on (routes.ts:12502 onward).
 */
function classify(dir: string): Sensitivity {
  if (dir.includes("academics")) return "academic"; // 10th/12th marksheets
  if (dir.includes("company-logos")) return "public"; // intended to be public
  if (dir.includes("support")) return "academic"; // ticket attachments
  return "identity"; // aadhaar, pan, profile photo, intro video
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile()) yield p;
  }
}

const rows: {
  file: string;
  dir: string;
  bytes: number;
  sensitivity: Sensitivity;
  sha256: string;
  mtime: string;
  ext: string;
}[] = [];

for await (const p of walk(ROOT)) {
  const rel = relative(ROOT, p);
  const dir = relative(ROOT, join(rel, "..")) || ".";
  const st = await stat(p);
  // Full hash: the manifest is the input to a re-key migration, so it needs to
  // prove the file was not altered in transit.
  const sha256 = createHash("sha256").update(await readFile(p)).digest("hex");
  rows.push({
    file: rel,
    dir,
    bytes: st.size,
    sensitivity: classify(dir),
    sha256,
    mtime: new Date(st.mtimeMs).toISOString(),
    ext: extname(p).slice(1),
  });
}

const bytes = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const bySensitivity = new Map<Sensitivity, typeof rows>();
for (const r of rows) {
  const list = bySensitivity.get(r.sensitivity) ?? [];
  list.push(r);
  bySensitivity.set(r.sensitivity, list);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  root: ROOT,
  totalFiles: rows.length,
  totalBytes: rows.reduce((a, r) => a + r.bytes, 0),
  counts: Object.fromEntries(
    [...bySensitivity].map(([k, v]) => [k, { files: v.length, bytes: v.reduce((a, r) => a + r.bytes, 0) }]),
  ),
  files: rows,
};

const out = "/tmp/opencode/findtern-upload-manifest.json";
await writeFile(out, JSON.stringify(manifest, null, 2));

console.log(`\nUpload audit — ${ROOT}\n${"─".repeat(52)}`);
console.log(`${rows.length} files · ${bytes(manifest.totalBytes)}\n`);

const label: Record<Sensitivity, string> = {
  identity: "IDENTITY  (aadhaar / PAN / photo / video)",
  academic: "ACADEMIC  (marksheets / ticket attachments)",
  public: "PUBLIC    (company logos, intended public)",
};

for (const s of ["identity", "academic", "public"] as Sensitivity[]) {
  const v = bySensitivity.get(s);
  const n = v?.length ?? 0;
  const b = v?.reduce((a, r) => a + r.bytes, 0) ?? 0;
  const flag = s === "public" ? "" : "  ← must not be world-readable";
  console.log(`  ${label[s]}\n    ${String(n).padStart(4)} files  ${bytes(b).padStart(9)}${flag}\n`);
}

console.log(`Manifest → ${out}`);
console.log(
  "\nEvery row above except PUBLIC is reachable today by anyone holding its URL,",
);
console.log("and intern_document.user_id already records who owns each file — the");
console.log("static mount simply never consults it.");
