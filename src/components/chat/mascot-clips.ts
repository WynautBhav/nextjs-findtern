/**
 * Marketing page clips (play once, hold the last frame). Pure data, so the budget test can import it
 * without a DOM. Files live in public/media/mascot/marketing/ (Phase 1) or m/ (Phase 2-3, set per clip via `dir`) as
 *   <clip>.webm / <clip>.mp4          640px (desktop)
 *   <clip>-sm.webm / <clip>-sm.mp4    320px (phones, chosen by <source media>)
 *   <clip>-start.webp / <clip>-end.webp  posters (end is the reduced-motion frame)
 */

/** brand-50 as a hex: the tokens remap in dark mode, the baked MP4 colour does not. */
export const STAGE_LIGHT = "#f0f7f4";
/** brand-950, the home hero background. */
export const STAGE_DARK = "#041d17";

/** `pad`: percent of the tile left empty on every side, for clips whose art runs close to the frame edge. */
type ClipDef = { mp4Bg: string; dir?: string; pad?: number };
const M_DIR = "/media/mascot/m";

export const PAGE_CLIPS = {
  /** Home hero: points left, the end pose is the point. Stands free on the dark hero. */
  "hero-point": { mp4Bg: STAGE_DARK },
  /** Pricing: sips a coffee. Cropped at the bottom on purpose, so it anchors to the tile's bottom edge. */
  "pricing-coffee": { mp4Bg: STAGE_LIGHT },
  /** About: waves. */
  "hero-wave": { mp4Bg: STAGE_LIGHT, dir: M_DIR },
  /** Employers: shield with a check (30 frames, ends ~1.25s). */
  "shield-check": { mp4Bg: STAGE_LIGHT, dir: M_DIR },
  /** Interns: holds up a resume. */
  "student-resume": { mp4Bg: STAGE_LIGHT, dir: M_DIR },
  /** FAQ: finds it with a magnifier. */
  "magnify-found": { mp4Bg: STAGE_LIGHT, dir: M_DIR },
  /** Guarantee page and the accepted-offer screen. The cap exits through the top; the owl sits ~3.5% higher in the frame. */
  "hired-celebrate": { mp4Bg: STAGE_LIGHT, dir: M_DIR },
  /** Contact: wears a headset. */
  headset: { mp4Bg: STAGE_LIGHT, dir: M_DIR, pad: 5 },
  /** Contact form sent. Same ~3.5% higher framing as hired-celebrate. */
  "success-jump": { mp4Bg: STAGE_LIGHT, dir: M_DIR },
  /** 404 page: lost with a map. */
  "map-404": { mp4Bg: STAGE_LIGHT, dir: M_DIR },
  /** Empty search results: shrugs. */
  "no-results-shrug": { mp4Bg: STAGE_LIGHT, dir: M_DIR, pad: 6 },
} as const satisfies Record<string, ClipDef>;

export type PageClip = keyof typeof PAGE_CLIPS;

/** Default directory (Phase 1 clips). */
export const PAGE_CLIP_DIR = "/media/mascot/marketing";
/** Public directory a clip's files live in. */
export const clipPad = (clip: PageClip): number => (PAGE_CLIPS[clip] as ClipDef).pad ?? 0;
export const clipDir = (clip: PageClip): string => (PAGE_CLIPS[clip] as ClipDef).dir ?? PAGE_CLIP_DIR;
/** Below this width the 320px encode is used (the owl is ~180px there). */
export const PAGE_CLIP_SM_MAX_PX = 767;

export const CLIP_BUDGET_BYTES = { webm: 400 * 1024, mp4: 300 * 1024, smWebm: 150 * 1024, poster: 25 * 1024 } as const;

/** True when the MP4 is flattened on the light tile colour, so a tile must be drawn behind the owl. */
export const needsTile = (clip: PageClip): boolean => PAGE_CLIPS[clip].mp4Bg.toLowerCase() === STAGE_LIGHT;
