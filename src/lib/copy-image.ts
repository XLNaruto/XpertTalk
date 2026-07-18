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

export async function copyImageToClipboard(url: string): Promise<void> {
  if (!url) throw new Error("No image URL");
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Clipboard image write unsupported");
  }

  const res = await fetch(url);
  const blob = await res.blob();
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
