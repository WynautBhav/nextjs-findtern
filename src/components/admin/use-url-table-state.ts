"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  clearFilters,
  resolveTableKeys,
  setParam,
  type TableKeys,
} from "./table-state.ts";

/**
 * Client-side handle on a table's URL state. Every change is a `router.replace`
 * (no history entry per keystroke) that resets the table's own page key.
 */
export function useUrlTableState(keyOverrides?: Partial<TableKeys>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const { pageKey, perKey, sortKey, dirKey, searchKey } = resolveTableKeys(keyOverrides);
  const keys: TableKeys = { pageKey, perKey, sortKey, dirKey, searchKey };

  const replace = useCallback(
    (qs: string) => {
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  const set = useCallback(
    (key: string, value: string | null, opts: { keepPage?: boolean } = {}) =>
      replace(setParam(searchParams.toString(), key, value, { pageKey }, opts)),
    [pageKey, replace, searchParams],
  );

  const setSort = useCallback(
    (sort: string | null, dir: "asc" | "desc" = "desc") => {
      let qs = setParam(searchParams.toString(), sortKey, sort, { pageKey });
      qs = setParam(qs, dirKey, sort ? dir : null, { pageKey });
      replace(qs);
    },
    [dirKey, pageKey, replace, searchParams, sortKey],
  );

  const clear = useCallback(
    (filterKeys: readonly string[]) =>
      replace(clearFilters(searchParams.toString(), filterKeys, { pageKey, searchKey })),
    [pageKey, replace, searchParams, searchKey],
  );

  return { keys, searchParams, pending, set, setSort, clear };
}
