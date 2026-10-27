/**
 * Browser helpers.
 *
 * `api()` makes a request from inside the page, exactly as the app's
 * `csrfFetch` does (src/lib/client-fetch.ts): same origin, the browser's own
 * session cookie, and the readable `ft_csrf` cookie echoed back as the
 * `x-csrf-token` header. It is used only where a step is API-driven (see
 * README); everything it does, a page in the app does the same way.
 */
import { deflateSync } from "node:zlib";

import { baseUrl } from "./env.mjs";

export function url(path) {
  return new URL(path, baseUrl()).toString();
}

/** Navigate and fail loudly on an error status (a 404/500 page still "loads"). */
export async function visit(page, path, { allowRedirectTo } = {}) {
  const res = await page.goto(url(path), { waitUntil: "domcontentloaded" });
  const status = res?.status() ?? 0;
  if (status >= 400) throw new Error(`GET ${path} → ${status}`);
  const landed = new URL(page.url()).pathname;
  if (allowRedirectTo === undefined && landed !== new URL(url(path)).pathname) {
    throw new Error(`GET ${path} redirected to ${landed}`);
  }
  return res;
}

/**
 * JSON request through the page. Returns { status, body }; never throws on
 * an HTTP error so the caller can put status and body in its assertion.
 */
export async function api(page, method, path, body) {
  if (!page.url().startsWith(baseUrl())) await page.goto(url("/"), { waitUntil: "domcontentloaded" });
  return page.evaluate(
    async ({ method, path, body }) => {
      const csrf = document.cookie.match(/(?:^|;\s*)ft_csrf=([^;]+)/)?.[1];
      const headers = { "Content-Type": "application/json" };
      if (csrf && method !== "GET") headers["x-csrf-token"] = decodeURIComponent(csrf);
      const res = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text.slice(0, 500);
      }
      return { status: res.status, body: parsed };
    },
    { method, path, body },
  );
}

/** POST /api/uploads the way components/app/file-upload.tsx does. */
export async function upload(page, { kind, base64, type, name }) {
  return page.evaluate(
    async ({ kind, base64, type, name }) => {
      const csrf = document.cookie.match(/(?:^|;\s*)ft_csrf=([^;]+)/)?.[1];
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          "Content-Type": type,
          "x-document-kind": kind,
          "x-file-name": encodeURIComponent(name),
          ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
        },
        body: new Blob([bytes], { type }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { kind, base64, type, name },
  );
}

/** Throw with the route, status and body when a call did not succeed. */
export function expectOk(label, res, ok = [200, 201]) {
  if (!ok.includes(res.status)) {
    throw new Error(`${label} → HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 600)}`);
  }
  return res.body;
}

/**
 * A real RGB PNG (default 64x64, one flat colour), built here so the upload
 * route's sharp re-encode gets a valid image rather than a fixture file.
 */
export function pngBase64(size = 64, rgb = [16, 120, 90]) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c;
}
