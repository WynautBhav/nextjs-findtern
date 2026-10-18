/**
 * Copy a local legacy uploads folder into the S3 bucket under `legacy/`, the
 * prefix store.ts reads legacy files from when STORAGE_BUCKET is set.
 * Skips objects that already exist with the same size, so it can be re-run.
 *
 * Usage: AWS_* + STORAGE_BUCKET=… node --experimental-strip-types \
 *          scripts/upload-legacy-to-s3.ts /path/to/uploads
 */
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

async function main() {
  const root = process.argv[2];
  const bucket = process.env.STORAGE_BUCKET;
  if (!root || !bucket) throw new Error("usage: STORAGE_BUCKET=… upload-legacy-to-s3.ts <uploads dir>");
  const s3 = new S3Client({ forcePathStyle: true });
  const files = await walk(root);
  let done = 0, skipped = 0, failed = 0;

  const queue = [...files];
  async function worker() {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const key = `legacy/${relative(root, f).split(sep).join("/")}`;
      try {
        const bytes = await readFile(f);
        const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).catch(() => null);
        if (head?.ContentLength === bytes.length) skipped++;
        else {
          const ext = f.split(".").pop()?.toLowerCase() ?? "";
          await s3.send(new PutObjectCommand({
            Bucket: bucket, Key: key, Body: bytes, ContentType: TYPES[ext] ?? "application/octet-stream",
          }));
          done++;
        }
      } catch (e) {
        failed++;
        console.error(`FAIL ${key}: ${(e as Error).message}`);
      }
      const n = done + skipped + failed;
      if (n % 250 === 0 || n === files.length) {
        console.log(`${n}/${files.length} (uploaded ${done}, skipped ${skipped}, failed ${failed})`);
      }
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));
  if (failed) process.exitCode = 1;
}

main();
