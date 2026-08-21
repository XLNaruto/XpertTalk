import { apiHeader, postData } from "@/lib/api-helper";
import logger from "@/lib/logger";

// `POST /chat/link/preview` unfurls a URL into a card. The server caches a
// resolved URL for 30 days (a failure for 6 hours) and answers 200 even when it
// couldn't fetch anything — `ok: false` with a guessed title, so the client can
// still render a plain link chip.

export interface LinkPreview {
  ok: boolean;
  cached?: boolean;
  /** Normalised URL — the server tells us to use this as the cache key. */
  url: string;
  resolvedUrl?: string;
  title?: string;
  description?: string;
  /** Stored thumbnail, or the site icon when the page has no og:image. */
  image?: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  /** True when `image` is only a favicon — render it as a badge, not a hero. */
  imageIsFavicon?: boolean;
  favicon?: string;
  type?: string;
  mediaType?: "LINK" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE";
  reason?: string;
  fetchedAt?: string;
}

// Matches the linkifier in message-formatters so a rendered link and the card
// always agree on what the URL is.
const URL_RE = /(\bhttps?:\/\/[^\s<]+|\bwww\.[^\s<]+)/i;
const URL_RE_ALL = new RegExp(URL_RE.source, "gi");
// Sentence punctuation that follows a URL rather than belonging to it.
const TRAILING = /[.,;:!?)\]}'"«»]+$/;

const MAX_URL_LENGTH = 2048;

/** How many links of one message are unfurled — the rest render as plain text. */
export const MAX_PREVIEW_URLS = 3;

/** Trim sentence punctuation, add a scheme, reject the unusable. */
function normaliseUrl(raw: string): string | null {
  let url = raw.replace(TRAILING, "");
  // A closing paren is part of the URL when the URL itself opened one.
  if (url.length === 0) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (url.length > MAX_URL_LENGTH) return null;
  return url;
}

/** First http(s) URL in a message's text (its caption included), or null. */
export function extractFirstUrl(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(URL_RE);
  if (!match) return null;
  return normaliseUrl(match[0]);
}

/**
 * Every http(s) URL in a message's text, normalised and de-duplicated, capped
 * at `limit`. A message can carry several links and each one gets its own card,
 * but the cap keeps a link-dump from turning into a wall of cards.
 */
export function extractUrls(
  text?: string | null,
  limit = MAX_PREVIEW_URLS
): string[] {
  if (!text) return [];

  const urls: string[] = [];
  for (const match of text.matchAll(URL_RE_ALL)) {
    const url = normaliseUrl(match[0]);
    if (url && !urls.includes(url)) urls.push(url);
    if (urls.length >= limit) break;
  }
  return urls;
}

/** Host shown on the card — "example.com", no www. */
export function previewHost(preview: LinkPreview): string {
  try {
    return new URL(preview.resolvedUrl || preview.url).hostname.replace(
      /^www\./,
      ""
    );
  } catch {
    return "";
  }
}

/** Where the card navigates to. */
export function previewHref(preview: LinkPreview): string {
  return preview.resolvedUrl || preview.url;
}

// ── Client-side cache ─────────────────────────────────────────
// Bubbles mount and unmount constantly under virtual scrolling, and the same
// link is often repeated across a chat, so resolved previews are held for the
// session and identical in-flight requests share one promise.

const resolved = new Map<string, LinkPreview>();
const inflight = new Map<string, Promise<LinkPreview | null>>();
// Transport failures (offline, 5xx) — retried after a cool-down instead of on
// every re-render. A server-side `ok: false` is a real answer and gets cached.
const failedAt = new Map<string, number>();
const FAILURE_COOLDOWN_MS = 60_000;

export function getCachedLinkPreview(url: string): LinkPreview | undefined {
  return resolved.get(url);
}

export async function fetchLinkPreview(
  url: string,
  opts?: { refresh?: boolean }
): Promise<LinkPreview | null> {
  if (!url) return null;

  if (!opts?.refresh) {
    const hit = resolved.get(url);
    if (hit) return hit;

    const pending = inflight.get(url);
    if (pending) return pending;

    const failed = failedAt.get(url);
    if (failed && Date.now() - failed < FAILURE_COOLDOWN_MS) return null;
  }

  const request = (async () => {
    try {
      const response: any = await postData(
        "chat/link/preview",
        opts?.refresh ? { url, refresh: true } : { url },
        apiHeader(false, 0)
      );
      if (
        String(response?.status) === "200" &&
        String(response?.data?.status) === "200" &&
        response.data.data
      ) {
        const preview: LinkPreview = response.data.data;
        // Key on the URL we asked for AND on the normalised one the server
        // returns, so a differently-typed form of the same link hits the cache.
        resolved.set(url, preview);
        if (preview.url && preview.url !== url) resolved.set(preview.url, preview);
        failedAt.delete(url);
        return preview;
      }
      // 400 invalid URL — remember it so we stop asking.
      resolved.set(url, { ok: false, url, reason: response?.data?.message });
      return resolved.get(url) || null;
    } catch (error) {
      logger.error("Link preview failed:", url, error);
      failedAt.set(url, Date.now());
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, request);
  return request;
}
