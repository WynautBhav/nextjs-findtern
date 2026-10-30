/**
 * Whether the first bytes of an upload match the type the client claimed.
 * The Content-Type header is the client's word; a renamed .exe sent as
 * application/pdf would otherwise be stored and later served to employers.
 */
export function bytesMatchType(type: string, bytes: Uint8Array): boolean {
  const at = (offset: number, sig: number[]) => sig.every((b, i) => bytes[offset + i] === b);
  const ascii = (offset: number, s: string) => at(offset, [...s].map((c) => c.charCodeAt(0)));
  switch (type) {
    case "application/pdf":
      // The spec lets the header sit anywhere in the first 1 KB.
      return Buffer.from(bytes.subarray(0, 1024)).includes("%PDF-");
    case "image/jpeg":
      return at(0, [0xff, 0xd8, 0xff]);
    case "image/png":
      return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "video/webm":
      return at(0, [0x1a, 0x45, 0xdf, 0xa3]);
    case "video/mp4":
    case "video/quicktime":
      return ["ftyp", "moov", "mdat", "wide", "free", "skip"].some((box) => ascii(4, box));
    default:
      return false;
  }
}
