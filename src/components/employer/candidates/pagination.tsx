import Link from "next/link";

import { buttonClass } from "@/components/ui/button";

export function Pagination({ pages, current, hrefFor }: { pages: number; current: number; hrefFor: (page: number) => string }) {
  if (pages <= 1) return null;
  const visible = Array.from({ length: pages }, (_, i) => i + 1).filter((page) => page === 1 || page === pages || Math.abs(page - current) <= 1);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-2">
      {visible.map((page, i) => (
        <span key={page} className="flex items-center gap-2">
          {i > 0 && visible[i - 1] !== page - 1 ? <span className="px-1 text-text-subtle">…</span> : null}
          <Link
            href={hrefFor(page)}
            aria-current={page === current ? "page" : undefined}
            aria-label={`Page ${page}`}
            className={buttonClass({
              variant: page === current ? "primary" : "white",
              size: "icon",
              className: "nums rounded-full text-sm",
            })}
          >
            {page}
          </Link>
        </span>
      ))}
    </nav>
  );
}
