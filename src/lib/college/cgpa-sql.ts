/**
 * The CGPA of a student out of their legacy `academics` JSON, as SQL text. `academics` is the SQL expression of that object.
 * Rounded ONCE, here, to the two decimals the screens show (cgpaText), so what a row displays, what the "min CGPA" filter
 * compares and which score band the student is in all read the same number: 8.4651 is 8.47 everywhere, 7.996 is 8.00 and
 * is in the 8+ band. Percentages are not converted (no honest conversion): they give NULL.
 */
export function cgpaSqlText(academics: string): string {
  return `(CASE
    WHEN coalesce(${academics}->>'scoreType', 'cgpa') = 'cgpa' AND (${academics}->>'score') ~ '^[0-9]+(\\.[0-9]+)?$'
      AND (${academics}->>'score')::float8 <= 10 THEN round((${academics}->>'score')::numeric, 2)::float8 END)`;
}
