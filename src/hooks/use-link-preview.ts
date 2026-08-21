import { useEffect, useState } from "react";
import {
  extractUrls,
  fetchLinkPreview,
  getCachedLinkPreview,
  MAX_PREVIEW_URLS,
  type LinkPreview,
} from "@/lib/link-preview";

/** A resolved preview together with the URL it was extracted from. */
export interface ResolvedPreview {
  /** The normalised URL as found in the text — the key for dismissing a card. */
  url: string;
  preview: LinkPreview;
}

/**
 * Unfurl every link in a message's text (capped at `MAX_PREVIEW_URLS`). Only
 * links that actually resolved are returned, in the order they appear, so a
 * caller can simply map over the result — a link still loading or one that
 * failed is absent rather than a placeholder.
 *
 * The result is derived during render from the module cache, which matters under
 * virtual scrolling: bubbles remount as you scroll and must not flash an empty
 * card each time. State holds only the async answers, keyed by URL, so a
 * changing text can never show a previous link's card.
 */
export function useLinkPreviews(
  text?: string | null,
  enabled = true,
  limit = MAX_PREVIEW_URLS
): ResolvedPreview[] {
  const urls = enabled ? extractUrls(text, limit) : [];
  // The URL list identity changes every render; its contents are what matter.
  const urlKey = urls.join("\n");
  const [fetched, setFetched] = useState<Record<string, LinkPreview | null>>({});

  useEffect(() => {
    let active = true;
    for (const url of urlKey ? urlKey.split("\n") : []) {
      if (getCachedLinkPreview(url)) continue;
      fetchLinkPreview(url).then((preview) => {
        if (active) setFetched((prev) => ({ ...prev, [url]: preview }));
      });
    }
    return () => {
      active = false;
    };
  }, [urlKey]);

  return urls
    .map((url) => ({
      url,
      preview: getCachedLinkPreview(url) ?? fetched[url] ?? null,
    }))
    .filter((entry): entry is ResolvedPreview => entry.preview !== null);
}

/** The first link's preview, or null — for callers that show a single card. */
export default function useLinkPreview(
  text?: string | null,
  enabled = true
): LinkPreview | null {
  return useLinkPreviews(text, enabled, 1)[0]?.preview ?? null;
}
