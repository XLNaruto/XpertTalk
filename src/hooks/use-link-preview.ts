import { useEffect, useState } from "react";
import {
  extractFirstUrl,
  fetchLinkPreview,
  getCachedLinkPreview,
  type LinkPreview,
} from "@/lib/link-preview";

/**
 * Unfurl the first link in a message's text. Returns null while there's nothing
 * to show — no URL, still loading, or the fetch failed — so a bubble can simply
 * render the card when it exists.
 *
 * The result is derived during render from the module cache, which matters under
 * virtual scrolling: bubbles remount as you scroll and must not flash an empty
 * card each time. State holds only the async answer, tagged with the URL it
 * belongs to, so a changing URL can never show the previous link's card.
 */
export default function useLinkPreview(
  text?: string | null,
  enabled = true
): LinkPreview | null {
  const url = enabled ? extractFirstUrl(text) : null;
  const [fetched, setFetched] = useState<{
    url: string;
    preview: LinkPreview | null;
  } | null>(null);

  const cached = url ? getCachedLinkPreview(url) : undefined;

  useEffect(() => {
    if (!url || getCachedLinkPreview(url)) return;

    let active = true;
    fetchLinkPreview(url).then((preview) => {
      if (active) setFetched({ url, preview });
    });
    return () => {
      active = false;
    };
  }, [url]);

  if (!url) return null;
  return cached ?? (fetched?.url === url ? fetched.preview : null);
}
