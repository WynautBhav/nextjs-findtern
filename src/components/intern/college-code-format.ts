/** Shows what the student typed as XXXX-XXXX-XXXX; case, spaces and dashes are forgiven (the server ignores them too). */
export function formatCollegeCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return clean.replace(/(.{4})(?=.)/g, "$1-");
}

export const isCollegeCodeComplete = (input: string) => formatCollegeCode(input).replace(/-/g, "").length === 12;
