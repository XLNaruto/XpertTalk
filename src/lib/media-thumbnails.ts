// Client-side thumbnails for media grids.
//
// The backend only serves originals, so a grid of full-size photos makes the
// browser decode multi-megabyte images (and spin up live <video> elements) for
// every tile that scrolls in — that's what makes scrolling stutter. Here each
// file is downloaded once, shrunk to a small WebP, and cached as an object URL,
// so tiles render a ~20 KB image that decodes instantly on every remount.

import { encodeBitmapToBlob } from "@/lib/image-encode";

export type ThumbnailKind = "image" | "video";

/** Shortest side of a generated thumbnail, in px (≈2× a grid tile). */
const THUMB_SIZE = 256;
const MAX_CONCURRENT = 4;
const VIDEO_TIMEOUT_MS = 10_000;
/** Oldest entries are revoked past this; ~20 KB each. */
const MAX_CACHED = 1000;

/** url → object URL, or null when generation failed (caller falls back). */
const cache = new Map<string, string | null>();

interface Job {
  url: string;
  kind: ThumbnailKind;
  listeners: Set<(thumb: string | null) => void>;
}

const pending = new Map<string, Job>();
let running = 0;

function remember(url: string, thumb: string | null) {
  cache.set(url, thumb);
  while (cache.size > MAX_CACHED) {
    const [oldUrl, oldThumb] = cache.entries().next().value!;
    if (oldThumb) URL.revokeObjectURL(oldThumb);
    cache.delete(oldUrl);
  }
}

function scaledSize(width: number, height: number) {
  const scale = Math.min(1, THUMB_SIZE / Math.min(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function captureVideoFrame(url: string): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    const finish = (result: ImageBitmap | Error) => {
      clearTimeout(timer);
      video.onloadedmetadata = video.onseeked = video.onerror = null;
      video.removeAttribute("src");
      video.load(); // release the network connection / decoder
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error("Video thumbnail timed out")), VIDEO_TIMEOUT_MS);

    video.onloadedmetadata = () => {
      // Frame 0 is often black; a tenth of a second in is usually real content.
      video.currentTime = Math.min(0.1, (video.duration || 0) / 2);
    };
    video.onseeked = () => {
      createImageBitmap(video).then(finish, (e) => finish(e instanceof Error ? e : new Error(String(e))));
    };
    video.onerror = () => finish(new Error("Video failed to load"));
    video.src = url;
  });
}

async function generate(url: string, kind: ThumbnailKind): Promise<string> {
  let bitmap: ImageBitmap;
  if (kind === "video") {
    bitmap = await captureVideoFrame(url);
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bitmap = await createImageBitmap(await response.blob());
  }
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    // WebP keeps transparency (stickers); browsers that can't encode it fall back to PNG.
    const blob = await encodeBitmapToBlob(bitmap, width, height, "image/webp", 0.8);
    return URL.createObjectURL(blob);
  } finally {
    bitmap.close?.();
  }
}

function pump() {
  while (running < MAX_CONCURRENT && pending.size > 0) {
    // Newest request first: after a fast scroll, the tiles now on screen were
    // requested last, and the ones scrolled past have usually been cancelled.
    const job = Array.from(pending.values()).pop()!;
    pending.delete(job.url);
    running++;
    generate(job.url, job.kind)
      .then(
        (thumb) => thumb,
        () => null
      )
      .then((thumb) => {
        remember(job.url, thumb);
        job.listeners.forEach((listener) => listener(thumb));
      })
      .finally(() => {
        running--;
        pump();
      });
  }
}

/** Cached result: object URL, null (failed — use the original), or undefined (not made yet). */
export function peekThumbnail(url: string): string | null | undefined {
  return cache.get(url);
}

/**
 * Queue a thumbnail; `onReady` fires once with the object URL, or null on failure.
 * Returns a cancel function — call it on unmount so scrolled-past tiles don't
 * hold up the queue.
 */
export function requestThumbnail(
  url: string,
  kind: ThumbnailKind,
  onReady: (thumb: string | null) => void
): () => void {
  const cached = cache.get(url);
  if (cached !== undefined) {
    onReady(cached);
    return () => {};
  }

  let job = pending.get(url);
  if (job) {
    // Re-insert so a re-requested URL moves to the front of the LIFO queue.
    pending.delete(url);
  } else {
    job = { url, kind, listeners: new Set() };
  }
  pending.set(url, job);
  job.listeners.add(onReady);
  pump();

  const current = job;
  return () => {
    current.listeners.delete(onReady);
    // Only drop jobs that haven't started; a running one still fills the cache.
    if (current.listeners.size === 0 && pending.get(url) === current) pending.delete(url);
  };
}
