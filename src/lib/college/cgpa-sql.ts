/**
 * The CGPA of a student out of their legacy `academics` JSON, as SQL text. `academics` is the SQL expression of that object.
 * Rounded ONCE, here, to the two decimals the screens show (cgpaText), so what a row displays, what the "min CGPA" filter
 * compares and which score band the student is in all read the same number: 8.4651 is 8.47 everywhere, 7.996 is 8.00 and
 * is in the 8+ band. A percentage (scoreType "percentage", or no type and a score above 10) is converted with the usual
 * Indian rule, CGPA = percentage / 9.5, capped at 10: 85% is 8.95.
 */
export const PERCENT_PER_CGPA = 9.5;

export function cgpaSqlText(academics: string): string {
  const score = `(${academics}->>'score')`;
  const type = `coalesce(nullif(${academics}->>'scoreType', ''), CASE WHEN ${score} ~ '^[0-9]+(\\.[0-9]+)?$' AND ${score}::float8 > 10 THEN 'percentage' ELSE 'cgpa' END)`;
  return `(CASE
    WHEN ${score} !~ '^[0-9]+(\\.[0-9]+)?$' THEN NULL
    WHEN ${type} = 'cgpa' AND ${score}::float8 <= 10 THEN round(${score}::numeric, 2)::float8
    WHEN ${type} = 'percentage' AND ${score}::float8 <= 100 THEN least(10, round(${score}::numeric / ${PERCENT_PER_CGPA}, 2))::float8
  END)`;
}
