/** http(s) link, or (when allowed) a site path like "/skills". Refuses javascript:, data:, and "//host". */
export function isSafeLink(value: string, allowRelative = false): boolean {
  const v = value.trim();
  return /^https?:\/\/\S+$/i.test(v) || (allowRelative && /^\/(?![\/\\])[^\s\\]*$/.test(v));
}
