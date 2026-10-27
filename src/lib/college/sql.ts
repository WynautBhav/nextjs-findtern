import { getTableColumns, getTableName, sql, type Column, type SQL, type Table } from "drizzle-orm";

/**
 * A fully qualified column ("table"."column") for correlated subqueries.
 *
 * Inside a single-table `db.select({...})`, Drizzle prints `${col}` as a bare
 * `"id"`, and in a subquery a bare name binds to the *inner* table: the drive
 * list counted `e.drive_id = e.id` and always showed zero. Raw `db.execute`
 * qualifies correctly; the select builder does not.
 */
export function q<T extends Table>(table: T, col: Column): SQL {
  const name = Object.values(getTableColumns(table)).find((c) => c === col)?.name ?? col.name;
  return sql`${sql.identifier(getTableName(table))}.${sql.identifier(name)}`;
}
