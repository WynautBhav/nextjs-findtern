"use client";

/**
 * Rows that leave a list (a payout marked paid, a message cleared) must not
 * take the keyboard with them: an `AnimatePresence` exit keeps the element
 * mounted for the length of the animation, and unmounting a focused element
 * drops focus to <body>. Call `moveFocus(row)` (or `moveFocus(row, ref)`)
 * before the state change that starts the exit.
 *
 * It only acts when focus is inside `row`, so a mouse click elsewhere is never
 * pulled. The target is the next row, else the previous one, else `to`.
 * `exit` is the matching motion `exit` prop: a rise and fade, or under
 * reduced motion a 120ms fade alone (transform and opacity only).
 */

import { useCallback } from "react";
import { useReducedMotion } from "motion/react";

import { ADMIN_DUR, ADMIN_EASE, seconds } from "./constants";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusIn(el: Element | null | undefined): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const target = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE);
  if (target) {
    target.focus();
    return document.activeElement === target;
  }
  // A heading or panel: focusable by script only, never a tab stop.
  if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
  el.focus();
  return document.activeElement === el;
}

export function useExitFocus() {
  const reduce = useReducedMotion();

  const moveFocus = useCallback((row: HTMLElement | null, to?: { current: HTMLElement | null } | HTMLElement | null) => {
    if (!row || !row.contains(document.activeElement)) return false;
    if (focusIn(row.nextElementSibling) || focusIn(row.previousElementSibling)) return true;
    const fallback = to && "current" in to ? to.current : to;
    return focusIn(fallback);
  }, []);

  const exit = reduce
    ? { opacity: 0, transition: { duration: seconds(ADMIN_DUR.fast) } }
    : { opacity: 0, y: -8, transition: { duration: seconds(ADMIN_DUR.base), ease: ADMIN_EASE } };

  return { moveFocus, exit };
}
