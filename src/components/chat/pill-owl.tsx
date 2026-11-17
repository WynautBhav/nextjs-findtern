"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { STAGE_LIGHT } from "./mascot-clips";
import { prefersMp4, type MascotClip } from "./mascot-state";
import {
  ENGAGED_SCROLL_PX,
  clipUrl,
  initialPickState,
  mayDownload,
  nextAct,
  restMs,
  revalidate,
  watchdogMs,
  type PickContext,
  type PickState,
  type PillAct,
} from "./pill-mascot";

/**
 * The owl in the closed chat pill. Runs only while `active` (the pill is closed and on screen); opening the
 * panel unmounts every video here (the panel's own Mascot takes over), closing starts it again on the idle loop.
 *
 * Rests on the idle loop 8-20 s, then plays one clip once (picked by pill-mascot.ts: a shuffled bag so every
 * clip shows up) and returns to idle. Two stacked <video>s crossfade, so a swap never flashes: the hidden one
 * preloads the NEXT clip while the idle loop rests (one clip ahead, never more). Nothing is downloaded for
 * reduced motion or Save-Data (the static poster stays), and nothing plays while the tab is hidden.
 * Test hooks: `data-clip` (clip showing now), `data-clip-count` (clips shown so far), `data-pill` (state).
 */
const POSTER = "/media/mascot/poster.webp";
const CROSSFADE_MS = 200;
const BYE_DELAY_MS = 700;
const LAYOUT_RETRY_MS = 2500;

type Slot = { v: HTMLVideoElement; clip: MascotClip | null };

export function PillMascot({
  active,
  path,
  cue = null,
  onCueDone,
  className,
}: {
  active: boolean;
  path: string;
  /** Play this act first (the launcher waves goodbye after a conversation). */
  cue?: "bye" | null;
  onCueDone?: () => void;
  className?: string;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const posterRef = useRef<HTMLImageElement>(null);
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const pathRef = useRef(path);
  const cueRef = useRef(cue);
  const cueDoneRef = useRef(onCueDone);
  const pickRef = useRef<PickState>(initialPickState());

  useEffect(() => {
    pathRef.current = path;
    cueRef.current = cue;
    cueDoneRef.current = onCueDone;
  }, [path, cue, onCueDone]);

  useEffect(() => {
    const root = rootRef.current;
    const poster = posterRef.current;
    const a = aRef.current;
    const b = bRef.current;
    if (!active || !root || !poster || !a || !b) return;

    const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (!mayDownload({ reducedMotion: reduceMq.matches, saveData })) {
      root.dataset.pill = "static";
      return;
    }

    // Safari/iOS: the opaque MP4 (it sits on the stage colour of the pill); no VP9: MP4 as well.
    let mp4 = prefersMp4() || !a.canPlayType('video/webm; codecs="vp9"');
    const slots: Slot[] = [
      { v: a, clip: null },
      { v: b, clip: null },
    ];
    let cur = 0;
    let gen = 0;
    let count = 0;
    const timers = new Set<number>();

    // What the page has been doing, for the picker.
    let lastActiveAt = performance.now();
    let scrollPx = 0;
    let lastY = window.scrollY;
    let clicks = 0;
    const ctx = (): PickContext => ({
      path: pathRef.current,
      idleMs: performance.now() - lastActiveAt,
      engaged: scrollPx >= ENGAGED_SCROLL_PX || clicks > 0,
    });
    const touch = () => {
      lastActiveAt = performance.now();
    };
    const onScroll = () => {
      scrollPx += Math.abs(window.scrollY - lastY);
      lastY = window.scrollY;
      touch();
    };
    const onPointerDown = () => {
      clicks += 1;
      touch();
    };

    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const sleep = (ms: number) => new Promise<void>((res) => later(res, ms));
    const onScreen = () => root.getClientRects().length > 0;

    /** Points a slot at a clip (starts downloading it); a slot already holding that clip is left alone. */
    const prep = (s: Slot, clip: MascotClip) => {
      if (s.clip === clip) return;
      s.clip = clip;
      s.v.loop = clip === "idle";
      s.v.preload = "auto";
      s.v.src = clipUrl(clip, mp4);
      s.v.load();
    };
    const ready = (s: Slot) =>
      new Promise<boolean>((res) => {
        const v = s.v;
        if (v.readyState >= 3) return res(true);
        const done = (ok: boolean) => {
          v.removeEventListener("canplay", onOk);
          v.removeEventListener("error", onErr);
          res(ok);
        };
        const onOk = () => done(true);
        const onErr = () => done(false);
        v.addEventListener("canplay", onOk, { once: true });
        v.addEventListener("error", onErr, { once: true });
        later(() => done(false), 8000);
      });

    /** Crossfades to `clip`. False when it could not be loaded or played (the current clip keeps showing). */
    const show = async (clip: MascotClip, myGen: number): Promise<boolean> => {
      const from = slots[cur];
      const to = slots[1 - cur];
      for (let attempt = 0; attempt < 2; attempt++) {
        prep(to, clip);
        if (await ready(to)) break;
        if (gen !== myGen) return false;
        if (mp4) return false;
        mp4 = true; // the WebM failed: retry once as MP4
        to.clip = null;
      }
      if (gen !== myGen || to.v.readyState < 3) return false;
      to.v.currentTime = 0;
      try {
        await to.v.play();
      } catch {
        return false;
      }
      if (gen !== myGen) return false;
      to.v.style.opacity = "1";
      from.v.style.opacity = "0";
      poster.style.visibility = "hidden";
      cur = 1 - cur;
      count += 1;
      root.dataset.clip = clip;
      root.dataset.clipCount = String(count);
      later(() => {
        if (gen === myGen && slots[cur] !== from) from.v.pause();
      }, CROSSFADE_MS + 60);
      return true;
    };

    const playedOut = (clip: MascotClip) =>
      new Promise<void>((res) => {
        const v = slots[cur].v;
        const done = () => {
          v.removeEventListener("ended", done);
          res();
        };
        v.addEventListener("ended", done, { once: true });
        later(done, watchdogMs(clip));
      });

    const cycle = async (myGen: number) => {
      // Never download for a pill that is not actually on screen (console pages hide it).
      while (!onScreen()) {
        await sleep(LAYOUT_RETRY_MS);
        if (gen !== myGen) return;
      }
      root.dataset.pill = "idle";
      if (!(await show("idle", myGen))) return;
      let first = true;
      while (gen === myGen) {
        const cued = first ? cueRef.current : null;
        first = false;
        const base = pickRef.current;
        let pick: { clip: PillAct; state: PickState };
        let wait: number;
        if (cued) {
          pick = { clip: cued, state: { ...base, last: cued } };
          wait = BYE_DELAY_MS;
        } else {
          pick = nextAct(base, ctx(), Math.random);
          wait = restMs(Math.random);
        }
        // Rest on the idle loop; the hidden slot preloads the next clip meanwhile.
        prep(slots[1 - cur], pick.clip);
        await sleep(wait);
        if (gen !== myGen) return;
        while (!onScreen()) {
          await sleep(LAYOUT_RETRY_MS);
          if (gen !== myGen) return;
        }
        // The page woke up while a sleepy was queued: pick again.
        if (!revalidate(pick.clip, ctx())) pick = nextAct(base, ctx(), Math.random);
        root.dataset.pill = "act";
        const ok = await show(pick.clip, myGen);
        if (gen !== myGen) return;
        if (ok) {
          pickRef.current = pick.state;
          scrollPx = 0;
          clicks = 0;
          await playedOut(pick.clip);
          if (gen !== myGen) return;
          if (cued) cueDoneRef.current?.();
          prep(slots[1 - cur], "idle");
          root.dataset.pill = "idle";
          if (!(await show("idle", myGen))) return;
        } else if (cued) {
          cueDoneRef.current?.();
        }
      }
    };

    const start = () => {
      gen += 1;
      void cycle(gen);
    };
    const stop = () => {
      gen += 1;
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      slots.forEach((s) => s.v.pause());
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        root.dataset.pill = "paused";
      } else {
        start();
      }
    };
    const onMotion = () => {
      if (reduceMq.matches) {
        stop();
        poster.style.visibility = "visible";
        slots.forEach((s) => (s.v.style.opacity = "0"));
        root.dataset.pill = "static";
      } else if (!document.hidden) {
        start();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    reduceMq.addEventListener("change", onMotion);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("keydown", touch, { passive: true });
    window.addEventListener("pointermove", touch, { passive: true });
    if (!document.hidden) start();
    else root.dataset.pill = "paused";

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      reduceMq.removeEventListener("change", onMotion);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", touch);
      window.removeEventListener("pointermove", touch);
      stop();
      // Release both decoders and abort any download: the panel's own Mascot takes over from here.
      slots.forEach((s) => {
        s.v.removeAttribute("src");
        s.v.load();
        s.v.style.opacity = "0";
        s.clip = null;
      });
      poster.style.visibility = "visible";
      root.dataset.pill = "off";
      delete root.dataset.clip;
    };
  }, [active]);

  const video = "absolute inset-0 size-full object-contain opacity-0 transition-opacity duration-200 motion-reduce:transition-none";
  return (
    <span
      ref={rootRef}
      aria-hidden
      data-pill-mascot
      data-pill="off"
      className={cn("relative block shrink-0 overflow-hidden rounded-full ring-2 ring-white/70", className)}
      style={{ backgroundColor: STAGE_LIGHT }}
    >
      <span className="relative block aspect-square size-full origin-[50%_30%] translate-y-[8%] scale-[1.3]">
        {/* Static poster until a clip is actually playing (and for reduced motion / Save-Data). */}
        {/* eslint-disable-next-line @next/next/no-img-element -- 360px static poster; next/image adds nothing here */}
        <img ref={posterRef} src={POSTER} alt="" draggable={false} className="absolute inset-0 size-full object-contain" />
        <video ref={aRef} muted playsInline preload="none" disablePictureInPicture tabIndex={-1} className={video} />
        <video ref={bRef} muted playsInline preload="none" disablePictureInPicture tabIndex={-1} className={video} />
      </span>
    </span>
  );
}
