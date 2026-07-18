// Encode an already-decoded ImageBitmap to a Blob.
//
// Prefers OffscreenCanvas.convertToBlob, which lets the browser run the
// (expensive) image encoding OFF the main thread, so large images don't freeze
// the UI. Falls back to a regular <canvas> where OffscreenCanvas is unavailable.
export async function encodeBitmapToBlob(
  source: ImageBitmap,
  width: number,
  height: number,
  type: string,
  quality?: number
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const oc = new OffscreenCanvas(width, height);
    const ctx = oc.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(source, 0, 0, width, height);
    return await oc.convertToBlob({ type, quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(source, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image encode failed"))),
      type,
      quality
    )
  );
}
