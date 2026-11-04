"use client";

import { Check, Columns3 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const on = new Set(visible);
  const hidden = INTERN_COLUMNS.length - on.size;

  const save = (next: Set<InternColKey>) => {
    // Catalog order, so the cookie and URL read the same however it was toggled.
    const list = INTERN_COLUMNS.filter((c) => next.has(c.key)).map((c) => c.key).join(",");
    rememberCols(adminUid, list);
    const q = new URLSearchParams(search.toString());
    q.set("cols", list);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  const toggle = (key: InternColKey) => {
    const next = new Set(on);
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
          className="z-50 max-h-[min(70vh,32rem)] w-60 overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-foreground shadow-lg"
        >
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
          <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
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
