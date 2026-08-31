// A message can carry up to 10 attachments (an "album"). Reads expose an
// ordered `mediaItems[]`; the flat `mediaId`/`mediaPath`/`mediaName`/`mediaType`
// fields are just `mediaItems[0]` repeated and exist only for pre-album clients.
// Everything in the UI should render from `getMediaItems()` so a single
// attachment is simply a one-item album — no separate code path.
//
// The other half of the same change: a media message can carry text. The caption
// lives in `messageText`, the same field a plain text message uses. So NEVER use
// `messageType` to decide whether a message has text — `messageType` only says
// how to render the bubble.

export interface MediaItem {
  mediaId: string;
  mediaPath: string;
  mediaName?: string;
  mediaType: string;
  position: number;
}

/** Build the ordered item list from an object holding media fields. */
function itemsFrom(src: any): MediaItem[] {
  if (!src) return [];

  if (Array.isArray(src.mediaItems) && src.mediaItems.length > 0) {
    return [...src.mediaItems]
      .filter((i: any) => i && i.mediaPath)
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      .map((i: any, idx: number) => ({
        mediaId: i.mediaId,
        mediaPath: i.mediaPath,
        mediaName: i.mediaName,
        mediaType: String(i.mediaType || "").toUpperCase(),
        position: i.position ?? idx,
      }));
  }

  // Pre-album shape (or a server that only sent the flat fields).
  if (src.mediaPath) {
    return [
      {
        mediaId: src.mediaId,
        mediaPath: src.mediaPath,
        mediaName: src.mediaName,
        mediaType: String(src.mediaType || src.messageType || "").toUpperCase(),
        position: 0,
      },
    ];
  }

  return [];
}

/**
 * Ordered attachments of a message, returning `[]` for text messages and
 * deleted tombstones.
 *
 * A forward gets its own copies of every attachment, so the forward's OWN
 * `mediaItems[]` is the authoritative album — `forwardMessage` is only a
 * preview of the original and carries flat fields (one attachment) plus a
 * `mediaCount`. Reading it first rendered a forwarded 4-image album as a
 * single image, so it is used only when the message itself has no media.
 */
export function getMediaItems(message: any): MediaItem[] {
  if (!message || message.isDeleted) return [];
  const own = itemsFrom(message);
  if (own.length > 0) return own;
  if (message.forwardFromMessageId && message.forwardMessage) {
    return itemsFrom(message.forwardMessage);
  }
  return [];
}

/**
 * The message's own text — the caption on a media message. Forward-aware.
 * Trimmed: stray leading/trailing blank lines would render as empty rows in the
 * bubble and push the inline timestamp off the text's last line.
 */
export function getMessageText(message: any): string {
  if (!message || message.isDeleted) return "";
  if (message.forwardFromMessageId) {
    return (
      message.forwardedMessageText ||
      message.forwardMessage?.messageText ||
      ""
    ).trim();
  }
  return (message.messageText || "").trim();
}

/** Attachment count for previews — uses the server's `mediaCount` when present. */
export function getMediaCount(message: any): number {
  if (!message) return 0;
  if (typeof message.mediaCount === "number") return message.mediaCount;
  const items = getMediaItems(message);
  if (items.length > 0) return items.length;
  // Preview-only shapes (reply/forward strips, talk-list lastMessage) carry the
  // count without the items.
  if (typeof message.forwardMessage?.mediaCount === "number")
    return message.forwardMessage.mediaCount;
  return 0;
}

const SINGULAR: Record<string, string> = {
  IMAGE: "Photo",
  VIDEO: "Video",
  AUDIO: "Audio",
  DOCUMENT: "Document",
};

const PLURAL: Record<string, string> = {
  IMAGE: "photos",
  VIDEO: "videos",
  AUDIO: "audio files",
  DOCUMENT: "documents",
};

/**
 * Human label for a message's attachments, with no caption involved.
 * `"3 photos"` for an album, `"Photo"` / the file name for a single item.
 */
export function mediaLabel(message: any): string {
  const count = getMediaCount(message);
  if (count === 0) return "";

  const items = getMediaItems(message);
  const types = new Set(items.map((i) => i.mediaType).filter(Boolean));
  const type =
    types.size === 1
      ? [...types][0]
      : String(message.mediaType || message.messageType || "").toUpperCase();

  if (count > 1) {
    // A mixed album has no single honest noun for it.
    if (types.size > 1) return `${count} attachments`;
    return `${count} ${PLURAL[type] || "attachments"}`;
  }

  if (type === "DOCUMENT" || type === "AUDIO") {
    return items[0]?.mediaName || message.mediaName || SINGULAR[type] || "File";
  }
  return SINGULAR[type] || "Attachment";
}

/**
 * One-line preview for reply bars, forward strips, the talk list and pinned
 * messages: the caption when there is one, otherwise a media description.
 */
export function previewLabel(message: any): string {
  const text = getMessageText(message);
  if (text) return text;
  return mediaLabel(message);
}

/** True when the message renders as an album (more than one attachment). */
export function isAlbum(message: any): boolean {
  return getMediaItems(message).length > 1;
}

/** Lightbox kind for an item — everything non-video opens as an image. */
export function itemKind(item: { mediaType?: string }): "image" | "video" {
  return String(item?.mediaType || "").toUpperCase() === "VIDEO"
    ? "video"
    : "image";
}

/** True for items the lightbox can display. */
export function isViewable(item: { mediaType?: string }): boolean {
  const t = String(item?.mediaType || "").toUpperCase();
  return t === "IMAGE" || t === "VIDEO";
}
