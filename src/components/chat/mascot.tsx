"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { clipDir, clipPad, needsTile, PAGE_CLIP_SM_MAX_PX, PAGE_CLIPS, STAGE_LIGHT, type PageClip } from "./mascot-clips";
import { setPageOwlVisible, usePageOwlVisible } from "./page-owl-store";
import { clipFor, isOneShot, prefersMp4, type MascotState } from "./mascot-state";

export type { PageClip } from "./mascot-clips";

/** Exactly the colour baked into the MP4 fallbacks (brand-50). Stages must use it. */
export const MASCOT_STAGE_BG = STAGE_LIGHT;

const BASE = "/media/mascot";
const FADE_S = 0.2;


/**
 * The owl, driven by `state`. Fills its (square) parent; decorative, so hidden from assistive tech.
 * - Videos mount only while `active` (and after `delayMs`), with preload=metadata, muted, inline.
 * - Clips swap with a ~200ms crossfade; one-shot clips call `onDone` when they end.
 * - Reduced motion, a failed load or "not mounted yet" all show the static poster.
 *
 * Pass `clip` instead of `state` for a marketing page owl (see ClipMascot): play once, hold the last frame.
 */
export function Mascot({
  state = "idle",
  clip,
  trigger,
  active = true,
  delayMs = 0,
  onDone,
  className,
}: {
  state?: MascotState;
  clip?: PageClip;
  /** Page clips only: "view" (default) plays at 60% in view, "mount" plays as soon as it is loaded. */
  trigger?: "mount" | "view";
  active?: boolean;
  delayMs?: number;
  onDone?: () => void;
  className?: string;
}) {
  if (clip) return <ClipMascot key={clip} clip={clip} trigger={trigger} className={className} />;
  return <StateMascot state={state} active={active} delayMs={delayMs} onDone={onDone} className={className} />;
}

function StateMascot({
  state,
  active,
  delayMs,
  onDone,
  className,
}: {
  state: MascotState;
  active: boolean;
  delayMs: number;
  onDone?: () => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<"webm" | "mp4" | null>(null);
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active || reduce) return;
    const t = window.setTimeout(() => setMode(prefersMp4() ? "mp4" : "webm"), delayMs);
    return () => {
      window.clearTimeout(t);
      setMode(null);
      setLive(false);
    };
  }, [active, reduce, delayMs]);

  const clip = clipFor(state);
  const playing = mode !== null && !reduce && !failed;

  return (
    <div aria-hidden className={cn("relative aspect-square", className)}>
      {/* Poster underneath until the first clip is actually playing. */}
      {!live && (
        // eslint-disable-next-line @next/next/no-img-element -- 360px static poster; next/image adds nothing here
        <img src={`${BASE}/poster.webp`} alt="" className="absolute inset-0 size-full object-contain" draggable={false} />
      )}
      {playing && (
        <AnimatePresence initial={false}>
          <motion.video
            key={clip}
            className="absolute inset-0 size-full object-contain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: FADE_S, ease: "easeOut" }}
            autoPlay
            muted
            playsInline
            preload="metadata"
            loop={!isOneShot(clip)}
            disablePictureInPicture
            tabIndex={-1}
            onPlaying={() => setLive(true)}
            onEnded={onDone}
            data-clip={clip}
          >
            {mode === "webm" && <source src={`${BASE}/${clip}.webm`} type='video/webm; codecs="vp9"' />}
            <source src={`${BASE}/${clip}.mp4`} type="video/mp4" onError={() => {
              setFailed(true);
              setLive(false);
            }} />
          </motion.video>
        </AnimatePresence>
      )}
    </div>
  );
}

/** Round owl avatar for buttons: the idle loop (or a one-shot such as `bye`), zoomed to head and chest so it reads at 40px. Size it with `className`. */
export function MascotAvatar({
  className,
  delayMs = 1500,
  state = "idle",
  onDone,
}: {
  className?: string;
  delayMs?: number;
  state?: MascotState;
  onDone?: () => void;
}) {
  // One owl per screen: while a page owl is in view the launcher shows its static poster.
  const pageOwlInView = usePageOwlVisible();
  return (
    <span
      aria-hidden
      className={cn("relative block shrink-0 overflow-hidden rounded-full ring-2 ring-white/70", className)}
      style={{ backgroundColor: MASCOT_STAGE_BG }}
    >
      <Mascot state={state} onDone={onDone} delayMs={delayMs} active={!pageOwlInView} className="size-full origin-[50%_30%] translate-y-[8%] scale-[1.3]" />
    </span>
  );
}

/** `<source media>` query for the 320px phone encode. */
/** Free-standing clips (no tile) in MP4 mode: feather the box edges so a slightly different page colour behind the opaque MP4 never shows as a box. */
const FEATHER = "linear-gradient(to right,transparent,#000 6%,#000 94%,transparent),linear-gradient(to bottom,transparent,#000 6%,#000 94%,transparent)";
const FEATHER_STYLE = { maskImage: FEATHER, WebkitMaskImage: FEATHER, maskComposite: "intersect", WebkitMaskComposite: "source-in" } as const;

const SM_MEDIA = `(max-width: ${PAGE_CLIP_SM_MAX_PX}px)`;

/**
 * A marketing page owl. Plays once when 60% of it is in view, holds the last frame, and resets to the
 * first frame when it leaves the screen (so it replays on re-entry). Nothing is fetched before the window
 * `load` event + an idle tick, and the video only mounts within ~1 viewport of the owl.
 * Reduced motion or Save-Data: the end poster only, no video. Safari/iOS (no WebM alpha): the MP4, which is
 * flattened on `mp4Bg`, so the stage behind it must be exactly that colour (PageMascot draws the tile).
 * Fills its (square) parent; the parent's size reserves the space, so nothing shifts when it loads.
 */
function ClipMascot({ clip, trigger = "view", className }: { clip: PageClip; trigger?: "mount" | "view"; className?: string }) {
  const reduce = useReducedMotion();
  const id = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [armed, setArmed] = useState(false);
  const [near, setNear] = useState(false);
  const [enough, setEnough] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [posterOk, setPosterOk] = useState(false);
  const [mode, setMode] = useState<"webm" | "mp4">("webm");
  const [saveData, setSaveData] = useState(false);

  // Arm only after load + an idle tick: no owl bytes compete with LCP.
  useEffect(() => {
    let cancelled = false;
    let handle: number | undefined;
    const arm = () => {
      const fire = () => {
        if (cancelled) return;
        setMode(prefersMp4() ? "mp4" : "webm");
        setSaveData((navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true);
        setArmed(true);
      };
      handle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(fire, { timeout: 1500 }) : window.setTimeout(fire, 300);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", arm);
      if (handle !== undefined && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(handle);
    };
  }, []);

  // Within ~1 viewport => may load. At 60% visible => plays. Fully out of view => resets. Any visibility => counts as "the page owl".
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const nearIo = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setNear(true);
        nearIo.disconnect();
      },
      { rootMargin: "100% 0px" },
    );
    const viewIo = new IntersectionObserver(
      ([e]) => {
        setPageOwlVisible(id, e.isIntersecting);
        if (!e.isIntersecting) setEnough(false);
        else if (e.intersectionRatio >= 0.6) setEnough(true);
      },
      { threshold: [0, 0.6] },
    );
    nearIo.observe(el);
    viewIo.observe(el);
    return () => {
      nearIo.disconnect();
      viewIo.disconnect();
      setPageOwlVisible(id, false);
    };
  }, [id]);

  const still = reduce || saveData || failed;
  const mounted = armed && near && !still;
  const shouldPlay = trigger === "mount" ? true : enough;

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !mounted) return;
    if (shouldPlay) {
      if (v.ended) v.currentTime = 0;
      void v.play().catch(() => {});
    } else {
      v.pause();
      if (v.currentTime > 0) v.currentTime = 0;
    }
  }, [shouldPlay, mounted, ready]);

  const dir = `${clipDir(clip)}/${clip}`;
  return (
    <div ref={boxRef} className={cn("relative aspect-square", className)}>
      {armed && near && !ready && (
        // eslint-disable-next-line @next/next/no-img-element -- ≤25KB static poster; next/image adds nothing here
        <img
          src={`${dir}-${still ? "end" : "start"}.webp`}
          alt=""
          draggable={false}
          decoding="async"
          onLoad={() => setPosterOk(true)}
          className={cn("absolute inset-0 size-full object-contain transition-opacity duration-300", posterOk ? "opacity-100" : "opacity-0")}
        />
      )}
      {mounted && (
        <video
          ref={videoRef}
          className={cn("absolute inset-0 size-full object-contain", ready ? "opacity-100" : "opacity-0")}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          tabIndex={-1}
          style={mode === "mp4" && !needsTile(clip) ? FEATHER_STYLE : undefined}
          onLoadedData={() => setReady(true)}
          data-clip={clip}
        >
          {mode === "webm" && <source src={`${dir}-sm.webm`} type='video/webm; codecs="vp9"' media={SM_MEDIA} />}
          {mode === "webm" && <source src={`${dir}.webm`} type='video/webm; codecs="vp9"' />}
          <source src={`${dir}-sm.mp4`} type="video/mp4" media={SM_MEDIA} />
          <source src={`${dir}.mp4`} type="video/mp4" onError={() => setFailed(true)} />
        </video>
      )}
    </div>
  );
}

/**
 * Marketing owl in its stage. Clips flattened on the light colour (every light page) sit on a rounded tile of exactly
 * that colour, so Chrome (alpha WebM) and Safari (opaque MP4) look identical; dark-flattened clips (home hero) stand
 * free on the page. Phones get ~176px; from `lg` it is `size` px. Clips that are cut at the bottom (coffee) simply run
 * to the tile's bottom edge on purpose.
 */
export function PageMascot({
  clip,
  size = 280,
  fixed = false,
  trigger,
  className,
  aspect = 1,
}: {
  clip: PageClip;
  /** Pixel width (the square side when `aspect` is 1). */
  size?: number;
  /** Width / height of the clip canvas; the box keeps this ratio so nothing shifts when the clip loads. */
  aspect?: number;
  /** App states: `size` px at every width instead of the smaller phone size. */
  fixed?: boolean;
  /** "mount" plays as soon as it is loaded (app states); default plays at 60% in view. */
  trigger?: "mount" | "view";
  className?: string;
}) {
  const tile = needsTile(clip);
  const square = aspect === 1;
  return (
    <div
      data-mascot={clip}
      aria-hidden
      className={cn(
        square ? (fixed ? "size-(--mascot-size)" : "size-44 lg:size-(--mascot-size)") : fixed ? "w-(--mascot-size)" : "w-44 lg:w-(--mascot-size)",
        "relative shrink-0",
        tile && "overflow-hidden rounded-3xl",
        className,
      )}
      style={{
        ["--mascot-size" as string]: `${size}px`,
        backgroundColor: tile ? PAGE_CLIPS[clip].mp4Bg : undefined,
        aspectRatio: square ? undefined : aspect,
      }}
    >
      <div className="absolute" style={{ inset: `${clipPad(clip)}%` }}>
        <Mascot clip={clip} trigger={trigger} className="size-full" />
      </div>
    </div>
  );
}
