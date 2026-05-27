import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { io, type Socket } from "socket.io-client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/shared/user-avatar";
import { apiHeader, getData } from "@/lib/api-helper";
import { useChatStore } from "@/stores/chat-store";
import { getEncodedCookie } from "@/lib/encryption";
import { cn } from "@/lib/utils";
import logger from "@/lib/logger";

// userStage removed — endpoints now use common prefix

interface ForwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageIds: string[];
  onForwarded?: () => void;
}

export function ForwardDialog({
  open,
  onOpenChange,
  messageIds,
  onForwarded,
}: ForwardDialogProps) {
  const [userList, setUserList] = useState<any[]>([]);
  const [selectedTalkIds, setSelectedTalkIds] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const WS_URL = useChatStore((s) => s.WS_URL);
  const token = getEncodedCookie("token") || "";

  // Fetch user list on open
  useEffect(() => {
    if (!open) return;
    setSelectedTalkIds([]);
    setSearchInput("");
    fetchUserList();
  }, [open]);

  const fetchUserList = async () => {
    setFetching(true);
    const response: any = await getData(
      "chat/talk/list",
      {},
      apiHeader(false, 0)
    );
    if (
      String(response?.status) === "200" &&
      String(response?.data.status) === "200"
    ) {
      setUserList(response.data.data);
    }
    setFetching(false);
  };

  // Filtered list
  const filteredList = useMemo(() => {
    if (!searchInput.trim()) return userList;
    const q = searchInput.toLowerCase();
    return userList.filter((item: any) =>
      (item.talkType === "PRIVATE" ? item.receiverName : item.talkName)
        ?.toLowerCase()
        .includes(q)
    );
  }, [userList, searchInput]);

  // Toggle selection
  const toggleSelect = useCallback((talkId: string) => {
    setSelectedTalkIds((prev) =>
      prev.includes(talkId)
        ? prev.filter((id) => id !== talkId)
        : [...prev, talkId]
    );
  }, []);

  // Forward via socket — temporary connection per target talk
  const forwardViaSocket = useCallback(
    (talkId: string, msgId: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const socket: Socket = io(`${WS_URL}/talk`, {
          path: "/socket.io/",
          query: { talkId, token },
          transports: ["websocket", "polling"],
          reconnection: false,
          forceNew: true,
        });

        const cleanup = () => {
          socket.removeAllListeners();
          socket.disconnect();
        };

        socket.on("connect", () => {
          socket.emit(
            "sendMessage",
            { forwardFromMessageId: msgId },
            (ack: any) => {
              cleanup();
              if (ack?.success) {
                resolve();
              } else {
                reject(new Error("Forward ack failed"));
              }
            }
          );
        });

        socket.on("connect_error", (err) => {
          cleanup();
          reject(err);
        });

        // Timeout fallback
        setTimeout(() => {
          cleanup();
          reject(new Error("Forward socket timeout"));
        }, 10000);
      }),
    [WS_URL, token]
  );

  // Forward using socket sendMessage event
  const handleForward = async () => {
    if (selectedTalkIds.length === 0) {
      toast.error("Select at least one recipient");
      return;
    }
    if (messageIds.length === 0) return;

    setLoading(true);
    try {
      for (const msgId of messageIds) {
        // Forward to all selected talks in parallel
        const results = await Promise.allSettled(
          selectedTalkIds.map((talkId) => forwardViaSocket(talkId, msgId))
        );
        const failed = results.filter((r) => r.status === "rejected");
        if (failed.length > 0) {
          logger.error("Some forwards failed:", failed);
          toast.error(
            `Failed to forward to ${failed.length} chat${failed.length > 1 ? "s" : ""}`
          );
          setLoading(false);
          return;
        }
      }
      toast.success(
        `Message${messageIds.length > 1 ? "s" : ""} forwarded to ${selectedTalkIds.length} chat${selectedTalkIds.length > 1 ? "s" : ""}`
      );
      onForwarded?.();
      onOpenChange(false);
    } catch {
      toast.error("Failed to forward message");
    } finally {
      setLoading(false);
    }
  };

  // Forward API (REST fallback)
  // const handleForwardApi = async () => {
  //   if (selectedTalkIds.length === 0) {
  //     toast.error("Select at least one recipient");
  //     return;
  //   }
  //   if (messageIds.length === 0) return;

  //   setLoading(true);
  //   try {
  //     // Forward each message to selected talks
  //     for (const msgId of messageIds) {
  //       const response: any = await postData(
  //         "chat/message/forward",
  //         {
  //           forwardFromMessageId: msgId,
  //           talkIds: selectedTalkIds,
  //         },
  //         apiHeader(false, 0)
  //       );
  //       if (
  //         String(response?.status) !== "200" ||
  //         String(response?.data?.status) !== "200"
  //       ) {
  //         toast.error("Failed to forward message");
  //         setLoading(false);
  //         return;
  //       }
  //     }
  //     toast.success(
  //       `Message${messageIds.length > 1 ? "s" : ""} forwarded to ${selectedTalkIds.length} chat${selectedTalkIds.length > 1 ? "s" : ""}`
  //     );
  //     onForwarded?.();
  //     onOpenChange(false);
  //   } catch {
  //     toast.error("Failed to forward message");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl border-border/50 bg-popover p-0">
        <DialogHeader className="border-b border-border/30 px-5 py-4">
          <DialogTitle className="text-base font-semibold text-foreground">
            Forward to...
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-5 pt-2 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              ref={searchRef}
              placeholder="Search chats..."
              className="h-9 rounded-xl border-0 bg-muted/70 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/30"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {searchInput && (
              <button
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setSearchInput("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* User grid */}
        <ScrollArea className="h-[320px] px-5">
          {fetching ? (
            <div className="flex h-full items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredList.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground/60">
              No results found
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3 py-2">
              {filteredList.map((data: any) => {
                const isPrivate = data.talkType === "PRIVATE";
                const name = isPrivate ? data.receiverName : data.talkName;
                const profile = isPrivate
                  ? data.receiverProfile
                  : data.talkProfile;
                const isSelected = selectedTalkIds.includes(data.talkId);

                return (
                  <button
                    key={data.talkId}
                    className="group flex flex-col items-center gap-2 rounded-xl p-2 transition-colors hover:bg-muted/60"
                    onClick={() => toggleSelect(data.talkId)}
                  >
                    <div className="relative">
                      <UserAvatar src={profile} name={name} size="lg" />
                      {isSelected && (
                        <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "w-full truncate text-center text-xs font-medium",
                        isSelected
                          ? "text-primary"
                          : "text-foreground"
                      )}
                    >
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/30 px-5 py-3">
          <span className="text-xs text-muted-foreground">
            {selectedTalkIds.length > 0
              ? `${selectedTalkIds.length} selected`
              : "Select recipients"}
          </span>
          <Button
            onClick={handleForward}
            disabled={loading || selectedTalkIds.length === 0}
            className="h-9 rounded-lg bg-gradient-to-r from-[var(--chat-gradient-from)] to-[var(--chat-gradient-to)] px-6 font-semibold text-white hover:opacity-90"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Send"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
