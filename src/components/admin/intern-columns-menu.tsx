"use client";

import { Check, Columns3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useProgressRouter } from "@/components/layout/navigation-progress";
import { DropdownMenu } from "radix-ui";

import { DEFAULT_COLS, INTERN_COLUMNS, type ColGroup, type InternColKey } from "@/lib/admin/intern-columns";

const GROUPS: ColGroup[] = ["Candidate", "Hiring", "Money", "Bank", "Account"];
const ITEM =
  "flex min-h-9 cursor-default items-center gap-2 rounded-lg px-2.5 text-sm outline-none data-[highlighted]:bg-[color:var(--admin-bar-tint)]";

function rememberCols(uid: string, list: string) {
  document.cookie = `ft_admin_intern_cols=${uid}|${list}; path=/admin; max-age=31536000; SameSite=Lax`;
}

/**
 * "Columns" menu for the Candidates table. The URL `cols` param drives the
 * server render; the same choice is saved in a cookie keyed to this admin so
 * the next visit renders it in one pass (no flash of the default set).
 */
export function InternColumnsMenu({ visible, adminUid }: { visible: InternColKey[]; adminUid: string }) {
  const router = useProgressRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  // Local copy so clicks faster than the router round-trip build on each other.
  const [on, setOn] = useState(() => new Set(visible));
  const latest = useRef(on);
  const pending = useRef<string | null>(null); // last list sent to the URL, until the server echoes it
  const key = visible.join(",");
  useEffect(() => {
    if (pending.current !== null && pending.current !== key) return; // stale echo of an earlier click
    pending.current = null;
    latest.current = new Set(key ? key.split(",") as InternColKey[] : []);
    setOn(latest.current);
  }, [key]);
  const hidden = INTERN_COLUMNS.length - on.size;

  const save = (next: Set<InternColKey>) => {
    latest.current = next;
    setOn(next);
    // Catalog order, so the cookie and URL read the same however it was toggled.
    const list = INTERN_COLUMNS.filter((c) => next.has(c.key)).map((c) => c.key).join(",");
    pending.current = list;
    rememberCols(adminUid, list);
    const q = new URLSearchParams(search.toString());
    q.set("cols", list);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  const toggle = (key: InternColKey) => {
    const next = new Set(latest.current);
    if (!next.delete(key)) next.add(key);
    // An empty set would fall back to the default on the server; keep one column on.
    if (next.size) save(next);
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="apple-spring inline-flex h-10 items-center gap-1.5 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11">
        <Columns3 className="size-4" aria-hidden />
        Columns{hidden ? ` · ${hidden} hidden` : ""}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 flex max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))] w-60 flex-col rounded-2xl border border-border bg-popover p-1.5 text-foreground shadow-lg"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
          {GROUPS.map((group) => (
            <DropdownMenu.Group key={group}>
              <DropdownMenu.Label className="px-2.5 pt-2 pb-1 text-xs font-medium text-text-subtle">{group}</DropdownMenu.Label>
              {INTERN_COLUMNS.filter((c) => c.group === group).map((c) => (
                <DropdownMenu.CheckboxItem
                  key={c.key}
                  checked={on.has(c.key)}
                  onCheckedChange={() => toggle(c.key)}
                  onSelect={(e) => e.preventDefault()}
                  className={ITEM}
                >
                  <span className="grid size-4 place-items-center rounded border border-border">
                    <DropdownMenu.ItemIndicator>
                      <Check className="size-3" aria-hidden />
                    </DropdownMenu.ItemIndicator>
                  </span>
                  {c.label}
                </DropdownMenu.CheckboxItem>
              ))}
            </DropdownMenu.Group>
          ))}
          </div>
          <DropdownMenu.Separator className="my-1.5 h-px shrink-0 bg-border" />
          <DropdownMenu.Item className={ITEM} onSelect={(e) => { e.preventDefault(); save(new Set(INTERN_COLUMNS.map((c) => c.key))); }}>
            Show all
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} onSelect={(e) => { e.preventDefault(); save(new Set(DEFAULT_COLS)); }}>
            Reset to default
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
