import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, FileText, Download, Loader2, Play } from "lucide-react";
import { format } from "date-fns";
import { apiHeader, getData } from "@/lib/api-helper";
import { getEncodedCookie } from "@/lib/encryption";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// Lazy-loaded media thumbnail — only loads when scrolled into view
const LazyMediaItem = React.memo(function LazyMediaItem({
  item,
  chatuserId,
  onPreview,
  onDownload,
}: {
  item: any;
  chatuserId: string;
  onPreview: (item: any) => void;
  onDownload: (e: React.MouseEvent, url: string, fileName: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isVideo = item.mediaType === "VIDEO";

  return (
    <div
      ref={containerRef}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-black/5 dark:bg-white/5"
      onClick={() => onPreview(item)}
    >
      {isVisible ? (
        isVideo ? (
          <>
            <video
              src={item.mediaPath}
              muted
              preload="metadata"
              className={cn(
                "h-full w-full object-cover transition-opacity duration-300",
                isLoaded ? "opacity-100" : "opacity-0"
              )}
              onLoadedData={() => setIsLoaded(true)}
            />
            <div className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary/80 backdrop-blur-sm">
              <Play className="ml-0.5 h-3 w-3 fill-white text-white" />
            </div>
          </>
        ) : (
          <img
            src={item.mediaPath}
            alt={item.name}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-300",
              isLoaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setIsLoaded(true)}
          />
        )
      ) : null}
      {/* Skeleton while loading */}
      {!isLoaded && (
        <div className="absolute inset-0 animate-pulse bg-muted/40" />
      )}
      {/* Hover overlay with download */}
      <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
        <span className="truncate px-1.5 pb-1 text-[9px] text-white/80">
          {String(item.senderChatuserId) === String(chatuserId) ? "You" : item.senderName}
        </span>
        <button
          className="m-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-colors hover:bg-black/60"
          onClick={(e) => onDownload(e, item.mediaPath, item.name)}
        >
          <Download className="h-3 w-3 text-white" />
        </button>
      </div>
    </div>
  );
});

interface MediaListSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  talkId: string;
  onMediaClick: (mediaPath: string, mediaType: "image" | "video", allItems: { mediaPath: string; mediaType: string; name?: string; senderChatuserId?: string; messageId?: string }[]) => void;
}

export function MediaListSheet({
  open,
  onOpenChange,
  talkId,
  onMediaClick,
}: MediaListSheetProps) {
  const chatuserId = getEncodedCookie("chatuserId") || "";
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMedia = useCallback(async () => {
    if (!talkId) return;
    setIsLoading(true);
    try {
      const response: any = await getData(
        "chat/media/list",
        { talkId },
        apiHeader(false, 0)
      );
      if (
        String(response?.status) === "200" &&
        String(response?.data.status) === "200"
      ) {
        setMediaItems(response.data.data || []);
      }
    } catch {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  }, [talkId]);

  useEffect(() => {
    if (open && talkId) {
      setMediaItems([]);
      fetchMedia();
    }
  }, [open, talkId, fetchMedia]);

  const handleDownload = async (e: React.MouseEvent, url: string, fileName: string) => {
    e.stopPropagation();
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  const handlePreview = (item: any) => {
    if (item.mediaType === "IMAGE" || item.mediaType === "VIDEO") {
      onOpenChange(false);
      setTimeout(() => {
        onMediaClick(
          item.mediaPath,
          item.mediaType === "VIDEO" ? "video" : "image",
          mediaItems
        );
      }, 300);
    }
  };

  const images = useMemo(
    () =>
      mediaItems
        .filter((m) => m.mediaType === "IMAGE" || m.mediaType === "VIDEO")
        .reverse(),
    [mediaItems]
  );
  const documents = useMemo(
    () => mediaItems.filter((m) => m.mediaType === "DOCUMENT").reverse(),
    [mediaItems]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-105 flex-col gap-0 overflow-hidden p-0 sm:max-w-105">
        <SheetHeader className="border-b border-border/50 px-4 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Image className="h-4 w-4 text-primary" />
            Media & Documents
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : mediaItems.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Image className="h-5 w-5 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">No media shared</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Photos, videos and documents will appear here
              </p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="media" className="flex flex-1 flex-col overflow-hidden">
            <TabsList className="mx-4 mt-3 mb-0 grid w-auto grid-cols-2">
              <TabsTrigger value="media" className="text-xs">
                Photos & Videos
                {images.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {images.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="documents" className="text-xs">
                Documents
                {documents.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {documents.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Photos & Videos tab */}
            <TabsContent value="media" className="flex-1 overflow-auto mt-0">
              <ScrollArea className="h-full">
                {images.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16">
                    <Image className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">No photos or videos</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 p-4">
                    {images.map((item) => (
                      <LazyMediaItem
                        key={item.mediaId}
                        item={item}
                        chatuserId={chatuserId}
                        onPreview={handlePreview}
                        onDownload={handleDownload}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Documents tab */}
            <TabsContent value="documents" className="flex-1 overflow-auto mt-0">
              <ScrollArea className="h-full">
                {documents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16">
                    <FileText className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">No documents</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 p-4">
                    {documents.map((item) => (
                      <div
                        key={item.mediaId}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-primary/5"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {item.name || "Document"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {String(item.senderChatuserId) === String(chatuserId) ? "You" : item.senderName}
                            {" · "}
                            {format(new Date(item.created), "MMM d, h:mm a")}
                          </p>
                        </div>
                        <button
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-primary/10"
                          )}
                          onClick={(e) => handleDownload(e, item.mediaPath, item.name)}
                        >
                          <Download className="h-4 w-4 text-primary/70" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
