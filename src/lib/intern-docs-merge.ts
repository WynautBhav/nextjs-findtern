/**
 * An intern should have one `intern_document` row, but parallel first uploads made several (the table has no unique
 * user_id, and staging and production already hold such duplicates, so no index is added). Every reader takes the NEWEST
 * row, and the upload writer updates the newest row too. When it does, it also copies in any file the newest row lacks
 * but an older duplicate has, so a file saved on an older row is not lost to the readers.
 */

const GROUPS = [
  ["profilePhotoName", "profilePhotoType", "profilePhotoSize"],
  ["introVideoName", "introVideoType", "introVideoSize"],
  ["aadhaarImageName", "aadhaarImageType", "aadhaarImageSize"],
  ["panImageName", "panImageType", "panImageSize"],
] as const;

type DocRow = Partial<Record<(typeof GROUPS)[number][number], string | number | null>>;

/** Columns (name, type, size together) that the newest row lacks and an older row, newest first, has. Empty when there is nothing to fill. */
export function fillFromOlder(rowsNewestFirst: DocRow[]): Record<string, string | number | null | undefined> {
  const [newest, ...older] = rowsNewestFirst;
  const patch: Record<string, string | number | null | undefined> = {};
  if (!newest) return patch;
  for (const [name, type, size] of GROUPS) {
    if (newest[name]) continue;
    const donor = older.find((r) => r[name]);
    if (donor) Object.assign(patch, { [name]: donor[name], [type]: donor[type], [size]: donor[size] });
  }
  return patch;
}
