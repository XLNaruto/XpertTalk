// HEIC/HEIF uploads are converted to PNG by the backend, which pushes the new
// path over the talk socket's `mediaConverted` event. Until that arrives the
// message still points at the original .heic/.heif file, which no browser
// except Safari can paint — so we show a loader in its place instead.

const HEIC_PATH_RE = /\.(heic|heif)(\?|#|$)/i;

/** True while a message's media is still the un-converted HEIC/HEIF original. */
export function isConvertingMedia(path?: string | null): boolean {
  return !!path && HEIC_PATH_RE.test(path);
}

/**
 * Normalise a `mediaConverted` socket payload. The backend may name the fields
 * a few different ways, so accept the common shapes and return null when the
 * event carries nothing usable.
 */
export function parseMediaConverted(data: any): {
  messageId?: string;
  mediaId?: string;
  mediaPath: string;
  mediaName?: string;
} | null {
  const media = data?.media ?? data;
  const mediaPath = media?.mediaPath ?? media?.path ?? media?.url;
  if (!mediaPath) return null;
  return {
    messageId: data?.messageId ?? media?.messageId,
    mediaId: data?.mediaId ?? media?.mediaId,
    mediaPath,
    mediaName: media?.mediaName ?? media?.name,
  };
}
