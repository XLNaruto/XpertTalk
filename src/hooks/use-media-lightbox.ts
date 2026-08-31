import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getMediaItems, isViewable } from "@/lib/media-items";

export interface MediaSlide {
  type: "image" | "video";
  src?: string;
  width?: number;
  height?: number;
  sources?: { src: string; type: string }[];
  poster?: string;
  // Extra metadata for delete/download/forward
  messageId: string;
  /** Identifies WHICH attachment of the message this slide is. */
  mediaId?: string;
  /** How many attachments the parent message carries — >1 means an album. */
  mediaCount?: number;
  forwardFromMessageId?: string;
  mediaPath: string;
  mediaName?: string;
  senderChatuserId: string;
  isPinned?: boolean;
  created?: string;
}

export default function useMediaLightbox(formattedMessages: any[]) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // One slide per ATTACHMENT, not per message: a message can carry up to 10, so
  // paging through the chat's media has to walk album items too.
  const slides = useMemo(() => {
    const out: MediaSlide[] = [];
    for (const msg of formattedMessages) {
      if (!msg || msg.isDeleted) continue;
      const items = getMediaItems(msg);
      for (const item of items) {
        if (!isViewable(item) || !item.mediaPath) continue;
        const common = {
          messageId: msg.messageId,
          mediaId: item.mediaId,
          mediaCount: items.length,
          forwardFromMessageId: msg.forwardFromMessageId,
          mediaPath: item.mediaPath,
          mediaName: item.mediaName,
          senderChatuserId: msg.senderChatuserId,
          isPinned: msg.isPinned,
          created: msg.created,
        };
        if (item.mediaType === "VIDEO") {
          out.push({
            type: "video" as const,
            width: 1280,
            height: 720,
            sources: [{ src: item.mediaPath, type: "video/mp4" }],
            poster: msg.thumbnailPath || "",
            ...common,
          });
        } else {
          out.push({ type: "image" as const, src: item.mediaPath, ...common });
        }
      }
    }
    return out;
  }, [formattedMessages]);

  const [externalSlides, setExternalSlides] = useState<MediaSlide[]>([]);
  const [useExternal, setUseExternal] = useState(false);

  // Freeze the slide list for as long as the lightbox is open. `slides` is
  // derived from the live message cache, so an incoming message or an older
  // page loading in would otherwise shift every index under the open carousel
  // and swap the visible image for a different one.
  const frozenSlides = useRef<MediaSlide[] | null>(null);
  if (!isOpen) frozenSlides.current = null;
  const messageSlides = isOpen && frozenSlides.current ? frozenSlides.current : slides;

  const activeSlides = useExternal ? externalSlides : messageSlides;
  const currentSlideResolved = activeSlides[currentIndex] as MediaSlide | undefined;

  const openMedia = useCallback(
    (
      mediaPath: string,
      mediaType: "image" | "video",
      messageId?: string,
      mediaId?: string
    ) => {
      // Match on mediaId first — an album shares one messageId across up to 10
      // slides, so a messageId lookup would always open the first attachment.
      let index = mediaId
        ? slides.findIndex((slide) => slide.mediaId === mediaId)
        : -1;

      // Then messageId: the same file can appear in several messages (forwards,
      // re-sends), so a mediaPath lookup lands on the wrong copy.
      if (index < 0 && messageId) {
        index = slides.findIndex((slide) => slide.messageId === messageId);
      }

      if (index < 0) {
        index = slides.findIndex((slide: any) => {
          if (mediaType === "image")
            return slide.type === "image" && slide.src === mediaPath;
          return (
            slide.type === "video" && slide.sources?.[0]?.src === mediaPath
          );
        });
      }

      if (index >= 0) {
        frozenSlides.current = slides;
        setUseExternal(false);
        setCurrentIndex(index);
      } else {
        // Fallback: single slide for media not in loaded messages
        const fallback: MediaSlide =
          mediaType === "image"
            ? { type: "image", src: mediaPath, messageId: "", mediaPath, mediaName: mediaPath.split("/").pop() || "download", senderChatuserId: "" }
            : { type: "video", width: 1280, height: 720, sources: [{ src: mediaPath, type: "video/mp4" }], messageId: "", mediaPath, mediaName: mediaPath.split("/").pop() || "download", senderChatuserId: "" };
        setExternalSlides([fallback]);
        setUseExternal(true);
        setCurrentIndex(0);
      }
      setIsOpen(true);
    },
    [slides]
  );

  /** Open lightbox with a full list of external media items, starting at the clicked one */
  const openMediaFromList = useCallback(
    (mediaPath: string, _mediaType: "image" | "video", allItems: { mediaPath: string; mediaType: string; name?: string; senderChatuserId?: string; messageId?: string; mediaId?: string }[], messageId?: string, mediaId?: string) => {
      const extSlides: MediaSlide[] = allItems
        .filter((item) => item.mediaType === "IMAGE" || item.mediaType === "VIDEO")
        .map((item): MediaSlide => {
          const isVideo = item.mediaType === "VIDEO";
          if (isVideo) {
            return {
              type: "video",
              width: 1280,
              height: 720,
              sources: [{ src: item.mediaPath, type: "video/mp4" }],
              messageId: item.messageId || "",
              mediaId: item.mediaId,
              mediaPath: item.mediaPath,
              mediaName: item.name || item.mediaPath.split("/").pop() || "download",
              senderChatuserId: item.senderChatuserId || "",
            };
          }
          return {
            type: "image",
            src: item.mediaPath,
            messageId: item.messageId || "",
            mediaId: item.mediaId,
            mediaPath: item.mediaPath,
            mediaName: item.name || item.mediaPath.split("/").pop() || "download",
            senderChatuserId: item.senderChatuserId || "",
          };
        });

      // The gallery returns one row per attachment, so album rows share a
      // messageId: counting rows per message tells the lightbox whether the
      // open slide belongs to an album (a single-item forward) or is the
      // message's only attachment (forward the message itself).
      const perMessage = new Map<string, number>();
      for (const s of extSlides) {
        if (!s.messageId) continue;
        perMessage.set(s.messageId, (perMessage.get(s.messageId) || 0) + 1);
      }
      for (const s of extSlides) {
        s.mediaCount = s.messageId ? perMessage.get(s.messageId) || 1 : 1;
      }

      // mediaId is what identifies the clicked one.
      let clickedIndex = mediaId
        ? extSlides.findIndex((s) => s.mediaId && s.mediaId === mediaId)
        : -1;
      if (clickedIndex < 0 && messageId) {
        clickedIndex = extSlides.findIndex(
          (s) => s.messageId && s.messageId === messageId
        );
      }
      if (clickedIndex < 0) {
        clickedIndex = extSlides.findIndex((s) =>
          s.type === "image" ? s.src === mediaPath : s.sources?.[0]?.src === mediaPath
        );
      }

      setExternalSlides(extSlides);
      setUseExternal(true);
      setCurrentIndex(clickedIndex >= 0 ? clickedIndex : 0);
      setIsOpen(true);
    },
    []
  );

  const close = useCallback(() => setIsOpen(false), []);

  // Close lightbox on browser back
  useEffect(() => {
    if (!isOpen) return;
    const handlePopState = () => setIsOpen(false);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isOpen]);

  return {
    isOpen,
    slides: activeSlides,
    currentIndex,
    setCurrentIndex,
    currentSlide: currentSlideResolved,
    openMedia,
    openMediaFromList,
    close,
  };
}
