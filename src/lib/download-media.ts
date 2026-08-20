/**
 * Download one media file. Fetches it into a blob so the browser saves it with
 * the original file name instead of navigating away; falls back to opening the
 * URL when the fetch is blocked (CORS, expired signature, …).
 */
export async function downloadMedia(url?: string, fileName?: string) {
  if (!url) return;
  const name = fileName || url.split("?")[0].split("/").pop() || "download";
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
}

/** Download every attachment of an album, one after another. */
export async function downloadMediaItems(
  items: { mediaPath: string; mediaName?: string }[]
) {
  for (const item of items) {
    await downloadMedia(item.mediaPath, item.mediaName);
  }
}
