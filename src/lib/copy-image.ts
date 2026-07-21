// Copy an image (by URL) to the system clipboard.
//
// We copy in the ORIGINAL format when the browser advertises support for it
// (smaller, no re-encode). Otherwise we convert to PNG — the format every
// browser accepts for clipboard writes. Encoding runs off the main thread via
// OffscreenCanvas so large images don't freeze the UI.

import { encodeBitmapToBlob } from "@/lib/image-encode";

async function convertToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    return await encodeBitmapToBlob(bitmap, bitmap.width, bitmap.height, "image/png");
  } finally {
    bitmap.close?.();
  }
}

function clipboardSupports(type: string): boolean {
  const supports = (ClipboardItem as any)?.supports;
  return typeof supports === "function" ? supports(type) : false;
}

// Cache fetched image bytes by URL so repeat copies of the same image skip the
// network round-trip and complete in milliseconds instead of re-downloading.
const blobCache = new Map<string, Blob>();

async function fetchImageBlob(url: string): Promise<Blob> {
  const cached = blobCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  const blob = await res.blob();
  blobCache.set(url, blob);
  return blob;
}

// Fetch (and optionally PNG-encode) an image ahead of time — call on render or
// hover so the eventual copy click is just a clipboard write.
export async function prewarmImage(url: string): Promise<void> {
  if (!url) return;
  try {
    const blob = await fetchImageBlob(url);
    if (blob.type && blob.type !== "image/png") await convertToPng(blob);
  } catch {
    // Best-effort warmup; ignore failures.
  }
}

export async function copyImageToClipboard(url: string): Promise<void> {
  if (!url) throw new Error("No image URL");
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Clipboard image write unsupported");
  }

  const blob = await fetchImageBlob(url);
  const originalType = blob.type || "image/png";

  // Write the original bytes directly only when the browser says it can — this
  // skips a doomed write attempt (and its PNG re-encode) on browsers like Chrome
  // that only accept PNG for image clipboard writes.
  if (originalType !== "image/png" && clipboardSupports(originalType)) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ [originalType]: blob }),
      ]);
      return;
    } catch {
      // Fall through to PNG.
    }
  }

  const png = originalType === "image/png" ? blob : await convertToPng(blob);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
