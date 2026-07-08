import { useState, useEffect, useCallback, useMemo } from "react";

export interface MediaSlide {
  type: "image" | "video";
  src?: string;
  width?: number;
  height?: number;
  sources?: { src: string; type: string }[];
  poster?: string;
  // Extra metadata for delete/download/forward
  messageId: string;
  forwardFromMessageId?: string;
  mediaPath: string;
  mediaName?: string;
  senderChatuserId: string;
  isPinned?: boolean;
}

export default function useMediaLightbox(formattedMessages: any[]) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const slides = useMemo(
    () =>
      formattedMessages
        .filter((msg) => {
          const effectiveType = msg.forwardFromMessageId
            ? msg.forwardMessage?.messageType
            : msg.messageType;
          const effectivePath = msg.forwardFromMessageId
            ? msg.forwardMessage?.mediaPath
            : msg.mediaPath;
          return (
            (effectiveType === "IMAGE" || effectiveType === "VIDEO") &&
            effectivePath &&
            !msg.isDeleted
          );
        })
        .map((msg): MediaSlide => {
          const effectiveType = msg.forwardFromMessageId
            ? msg.forwardMessage?.messageType
            : msg.messageType;
          const effectivePath = msg.forwardFromMessageId
            ? msg.forwardMessage?.mediaPath
            : msg.mediaPath;
          const effectiveName = msg.forwardFromMessageId
            ? msg.forwardMessage?.mediaName
            : msg.mediaName;

          if (effectiveType === "IMAGE") {
            return {
              type: "image" as const,
              src: effectivePath,
              messageId: msg.messageId,
              forwardFromMessageId: msg.forwardFromMessageId,
              mediaPath: effectivePath,
              mediaName: effectiveName,
              senderChatuserId: msg.senderChatuserId,
              isPinned: msg.isPinned,
            };
          }
          return {
            type: "video" as const,
            width: 1280,
            height: 720,
            sources: [{ src: effectivePath, type: "video/mp4" }],
            poster: msg.thumbnailPath || "",
            messageId: msg.messageId,
            forwardFromMessageId: msg.forwardFromMessageId,
            mediaPath: effectivePath,
            mediaName: effectiveName,
            senderChatuserId: msg.senderChatuserId,
            isPinned: msg.isPinned,
          };
        }),
    [formattedMessages]
  );


  const [externalSlides, setExternalSlides] = useState<MediaSlide[]>([]);
  const [useExternal, setUseExternal] = useState(false);

  const activeSlides = useExternal ? externalSlides : slides;
  const currentSlideResolved = activeSlides[currentIndex] as MediaSlide | undefined;

  const openMedia = useCallback(
    (mediaPath: string, mediaType: "image" | "video") => {
      const index = slides.findIndex((slide: any) => {
        if (mediaType === "image")
          return slide.type === "image" && slide.src === mediaPath;
        return (
          slide.type === "video" && slide.sources?.[0]?.src === mediaPath
        );
      });

      if (index >= 0) {
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
    (mediaPath: string, _mediaType: "image" | "video", allItems: { mediaPath: string; mediaType: string; name?: string; senderChatuserId?: string; messageId?: string }[]) => {
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
              mediaPath: item.mediaPath,
              mediaName: item.name || item.mediaPath.split("/").pop() || "download",
              senderChatuserId: item.senderChatuserId || "",
            };
          }
          return {
            type: "image",
            src: item.mediaPath,
            messageId: item.messageId || "",
            mediaPath: item.mediaPath,
            mediaName: item.name || item.mediaPath.split("/").pop() || "download",
            senderChatuserId: item.senderChatuserId || "",
          };
        });

      const clickedIndex = extSlides.findIndex((s) =>
        s.type === "image" ? s.src === mediaPath : s.sources?.[0]?.src === mediaPath
      );

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
