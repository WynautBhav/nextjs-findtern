/**
 * Kept apart from xlsx.ts on purpose: xlsx.ts imports node:zlib, and anything a client component
 * imports must not reach it (the bundler then ships Node polyfills, and an eval probe that a strict CSP reports).
 */

/** A ZIP local-file signature ("PK\x03\x04") - how an .xlsx upload is told from CSV. */
export function isXlsx(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
