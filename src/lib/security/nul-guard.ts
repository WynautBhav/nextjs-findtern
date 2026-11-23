/**
 * Postgres cannot store a NUL (U+0000) in text, so a NUL anywhere in a path id or a JSON string
 * reached the database and came back as an empty 500. One check at the proxy answers 400 for all
 * routes instead of patching every schema.
 */

/** True when the raw request URL carries an encoded NUL (%00) in its path or query. */
export function urlHasNul(rawUrl: string): boolean {
  return /%00/i.test(rawUrl) || rawUrl.includes("\u0000");
}

/** True when a JSON text holds a NUL in any string value or key. Unparseable text is not this guard's business. */
export function jsonTextHasNul(text: string): boolean {
  // Cheap pre-check: a NUL can only appear as the escape \u0000 (or a raw NUL, which is invalid JSON).
  if (!text.includes("\\u0000") && !text.includes("\u0000")) return false;
  let found = false;
  try {
    JSON.parse(text, function (key, value) {
      if (key.includes("\u0000") || (typeof value === "string" && value.includes("\u0000"))) found = true;
      return value;
    });
  } catch {
    return text.includes("\u0000");
  }
  return found;
}
