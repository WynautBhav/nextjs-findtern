"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, Loader2, RotateCw, UserRound, ZoomIn, ZoomOut } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

const MB = 1024 * 1024;
/** Legacy limits: JPG or PNG, up to 1 MB, saved as a 600×600 square. */
const MAX_BYTES = 1 * MB;
const TYPES = ["image/jpeg", "image/png"];
const OUTPUT = 600;
const MAX_ZOOM = 3;

type Loaded = { url: string; img: HTMLImageElement; name: string };

/**
 * Profile photo with a square crop (INT-21), as the legacy form had: pick a
 * JPG or PNG up to 1 MB, drag to position it, zoom and rotate, and the square
 * is saved at 600×600. The crop runs on a canvas in the browser, so there is
 * no extra dependency and the original never leaves the device.
 */
export function PhotoUpload({
  src,
  error,
  onUploaded,
}: {
  /** The current photo, if any. */
  src: string;
  error?: string;
  onUploaded: () => void;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => () => {
    if (loaded) URL.revokeObjectURL(loaded.url);
  }, [loaded]);

  function pick(file: File) {
    setProblem(null);
    if (!TYPES.includes(file.type)) return setProblem("Use a JPG or PNG photo.");
    if (file.size > MAX_BYTES) return setProblem(`That photo is ${(file.size / MB).toFixed(1)} MB. The limit is 1 MB.`);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setLoaded({ url, img, name: file.name });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setProblem("That photo could not be opened. Try another one.");
    };
    img.src = url;
  }

  const shownError = problem ?? error;

  return (
    <div id="photo" tabIndex={-1} className="flex flex-col gap-5 outline-none sm:flex-row sm:items-center">
      <div
        className={cn(
          "grid size-28 shrink-0 place-items-center overflow-hidden rounded-apple-xl border bg-ink-50",
          shownError ? "border-danger" : "border-ink-200/80",
        )}
      >
        {src ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={src} alt="Your profile photo" className="size-full object-cover" />
        ) : (
          <UserRound className="size-10 text-ink-300" aria-hidden />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-800">Profile photo</p>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-600">
          A clear, front-facing photo, like a passport one. JPG or PNG, up to 1 MB. You can crop it next.
        </p>
        <label
          htmlFor={inputId}
          className={buttonClass({ variant: "outline", size: "sm", className: "mt-3 min-h-11 cursor-pointer focus-within:ring-[3px] focus-within:ring-brand-600/20" })}
        >
          <Camera className="size-4" aria-hidden />
          {src ? "Change photo" : "Upload photo"}
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={TYPES.join(",")}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pick(f);
              e.target.value = "";
            }}
          />
        </label>
        {shownError ? (
          <p role="alert" className="mt-2 text-xs font-medium text-danger">
            {shownError}
          </p>
        ) : null}
      </div>

      <Dialog open={Boolean(loaded)} onOpenChange={(open) => (open ? null : setLoaded(null))}>
        <DialogContent className="max-w-[calc(100%-2rem)] gap-0 rounded-apple-xl border-ink-200/80 bg-white p-0 sm:max-w-md">
          {loaded ? (
            <Cropper
              source={loaded}
              onCancel={() => setLoaded(null)}
              onDone={() => {
                setLoaded(null);
                onUploaded();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Cropper({ source, onCancel, onDone }: { source: Loaded; onCancel: () => void; onDone: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [size, setSize] = useState(288);
  const [zoom, setZoom] = useState(1);
  const [turn, setTurn] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setSize(el.clientWidth || 288);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { img } = source;
  const sideways = turn % 180 !== 0;
  const rw = sideways ? img.naturalHeight : img.naturalWidth;
  const rh = sideways ? img.naturalWidth : img.naturalHeight;
  const scale = (size / Math.min(rw, rh)) * zoom;

  /** Keeps the photo covering the square, whatever the zoom. */
  const clamp = (x: number, y: number, s = scale) => {
    const mx = Math.max(0, (rw * s - size) / 2);
    const my = Math.max(0, (rh * s - size) / 2);
    return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  };
  const at = clamp(offset.x, offset.y);

  function setZoomTo(next: number) {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    setZoom(z);
    setOffset((o) => clamp(o.x, o.y, (size / Math.min(rw, rh)) * z));
  }

  async function save() {
    setBusy(true);
    setProblem(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      const k = OUTPUT / size;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.translate(OUTPUT / 2 + at.x * k, OUTPUT / 2 + at.y * k);
      ctx.rotate((turn * Math.PI) / 180);
      ctx.scale(scale * k, scale * k);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("no blob");
      const name = `${source.name.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "photo"}.jpg`;
      const res = await csrfFetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg", "x-document-kind": "profile_photo", "x-file-name": encodeURIComponent(name) },
        body: blob,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed. Try again.");
      onDone();
    } catch (e) {
      setProblem(e instanceof Error && e.message !== "no canvas" && e.message !== "no blob" ? e.message : "The photo could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-5 sm:p-6">
      <DialogTitle className="text-lg font-semibold text-ink-900">Crop your photo</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-ink-600">Drag to position your face in the square. Use zoom to fill it.</DialogDescription>

      <div
        ref={frame}
        role="img"
        aria-label="Photo crop area. Use the arrow keys to move the photo."
        tabIndex={0}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: at.x, oy: at.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setOffset(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 20 : 6;
          const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
          const m = moves[e.key];
          if (!m) return;
          e.preventDefault();
          setOffset(clamp(at.x + m[0], at.y + m[1]));
        }}
        className="relative mx-auto mt-5 aspect-square w-full max-w-[18rem] cursor-grab touch-none select-none overflow-hidden rounded-apple-lg bg-ink-900 outline-none focus-visible:ring-[3px] focus-visible:ring-brand-600/30 active:cursor-grabbing"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source.url}
          alt=""
          draggable={false}
          style={{
            width: img.naturalWidth,
            height: img.naturalHeight,
            maxWidth: "none",
            transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px) rotate(${turn}deg) scale(${scale})`,
          }}
          className="pointer-events-none absolute left-1/2 top-1/2"
        />
        {/* Rule-of-thirds guide, so a face lands near the centre. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="border-[0.5px] border-white/25" />
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={() => setZoomTo(zoom - 0.2)} aria-label="Zoom out" className={buttonClass({ variant: "ghost", size: "icon", className: "size-11" })}>
          <ZoomOut className="size-4" aria-hidden />
        </button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoomTo(Number(e.target.value))}
          aria-label="Zoom"
          className="h-11 min-w-0 flex-1 accent-brand-700"
        />
        <button type="button" onClick={() => setZoomTo(zoom + 0.2)} aria-label="Zoom in" className={buttonClass({ variant: "ghost", size: "icon", className: "size-11" })}>
          <ZoomIn className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            setTurn((t) => (t + 90) % 360);
            setOffset({ x: 0, y: 0 });
          }}
          aria-label="Rotate 90 degrees"
          className={buttonClass({ variant: "ghost", size: "icon", className: "size-11" })}
        >
          <RotateCw className="size-4" aria-hidden />
        </button>
      </div>

      {problem ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {problem}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={busy} className={buttonClass({ variant: "light", size: "md", className: "w-full sm:w-auto" })}>
          Cancel
        </button>
        <button type="button" onClick={() => void save()} disabled={busy} className={buttonClass({ variant: "primary", size: "md", className: "w-full sm:w-auto" })}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {busy ? "Saving…" : "Save photo"}
        </button>
      </div>
    </div>
  );
}
