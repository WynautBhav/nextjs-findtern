"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogIn, UserPlus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Single entry point for both unauthenticated audiences.
 *
 * The header previously carried "Log in" and "Get Started" side by side. Both
 * were making the same argument - come in - and the pair competed for
 * attention without telling anyone which one to pick. One control that says
 * "Get started" and then asks which door you are walking through is the same
 * intent stated once, with the choice made explicit.
 *
 * Two surfaces, not four: a candidate signs up, a company registers. Employer
 * registration lives in the same menu because it is the other half of the
 * marketplace, and hiding it would make the employer path undiscoverable.
 *
 * Radix gives keyboard navigation, typeahead, escape-to-close, focus
 * restoration and outside-click dismissal for free, which a hand-rolled
 * popover would have had to reimplement badly.
 */
export function GetStartedMenu({ className = "" }: { className?: string }) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-200 hover:bg-brand-600 hover:shadow-md active:scale-[0.97] data-[state=open]:bg-brand-600 ${className}`}
      >
        Get started
        <ChevronDown
          className="size-3.5 transition-transform duration-200 data-[state=open]:rotate-180"
          aria-hidden
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>I&apos;m looking for</DropdownMenuLabel>

        {/* asChild so each item is a real <a> - middle-click, open-in-new-tab
            and "copy link" all work, and Radix still closes the menu. */}
        <DropdownMenuItem asChild>
          <Link href="/signup">
            <UserPlus className="size-4 shrink-0 text-brand-600" aria-hidden />
            <span className="flex flex-col items-start gap-0.5">
              <span>A job or internship</span>
              <span className="text-xs font-normal text-ink-600">
                Create a candidate account
              </span>
            </span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/employer/signup">
            <UserPlus className="size-4 shrink-0 text-brand-600" aria-hidden />
            <span className="flex flex-col items-start gap-0.5">
              <span>Interns to hire</span>
              <span className="text-xs font-normal text-ink-600">
                Register your company
              </span>
            </span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Already registered</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link
            href="/login"
            onClick={() => {
              // Close on navigation even if the router takes a moment.
              router.refresh();
            }}
          >
            <LogIn className="size-4 shrink-0 text-ink-500" aria-hidden />
            <span className="flex flex-col items-start gap-0.5">
              <span>Sign in</span>
              <span className="text-xs font-normal text-ink-600">
                Candidates and employers
              </span>
            </span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}