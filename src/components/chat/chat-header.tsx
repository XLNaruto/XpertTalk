import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, BellOff, ChevronDown, ChevronUp, Download, Forward, Image, Pin, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { MuteDialog } from "@/components/chat/mute-dialog";

interface ChatHeaderProps {
  receiverName: string;
  receiverProfile: string;
  talkName: string;
  talkProfile: string;
  talkType: string;
  isActive: boolean;
  isMobile: boolean;
  isGroupAdmin: boolean;
  groupMemberCount: number;
  isSelectionMode: boolean;
  selectedCount: number;
  canDeleteSelected: boolean;
  onBackClick: () => void;
  onProfileClick: () => void;
  onCancelSelection: () => void;
  onForwardSelected?: () => void;
  onDeleteSelected?: () => void;
  // Search props
  isSearchOpen: boolean;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  searchResultCount: number;
  currentSearchIndex: number;
  isSearching: boolean;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onSearchNext: () => void;
  onSearchPrev: () => void;
  onPinnedClick: () => void;
  onMediaListClick: () => void;
  /** Live mute state of this talk (a lapsed `muteUntil` counts as unmuted). */
  isMuted?: boolean;
  muteLabel?: string;
  /**
   * Mute/unmute this talk — only provided when the build may mute (admin).
   * `muteUntil` is null for an indefinite mute and for unmuting.
   */
  onToggleMute?: (isMuted: boolean, muteUntil: string | null) => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  receiverName,
  receiverProfile,
  talkName,
  talkProfile,
  talkType,
  isActive,
  isMobile,
  groupMemberCount,
  isSelectionMode,
  selectedCount,
  canDeleteSelected,
  onBackClick,
  onProfileClick,
  onCancelSelection,
  onForwardSelected,
  onDeleteSelected,
  isSearchOpen,
  searchTerm,
  onSearchTermChange,
  searchResultCount,
  currentSearchIndex,
  isSearching,
  onSearchOpen,
  onSearchClose,
  onSearchNext,
  onSearchPrev,
  onPinnedClick,
  onMediaListClick,
  isMuted,
  muteLabel,
  onToggleMute,
}) => {
  const { canInstall, install } = usePwaInstall();
  const [muteDialogOpen, setMuteDialogOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isPrivate = talkType === "PRIVATE";
  const isGroup = talkType === "GROUP";
  const displayName = isPrivate ? receiverName : talkName;
  const displayProfile = isPrivate ? receiverProfile : talkProfile;

  // Auto-focus search input when opened
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isSearchOpen]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        onSearchPrev();
      } else {
        onSearchNext();
      }
    } else if (e.key === "Escape") {
      onSearchClose();
    }
  };

  return (
    <div className="relative">
      <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border/50 bg-background px-4">
        {/* Left section */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-lg hover:bg-primary/10 hover:text-primary"
              onClick={onBackClick}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}

          {isSelectionMode && (
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-lg hover:bg-primary/10 hover:text-primary"
              onClick={onCancelSelection}
            >
              <X className="h-5 w-5" />
            </Button>
          )}

          <div
            className={cn(
              "flex min-w-0 items-center gap-3",
              isGroup && "cursor-pointer"
            )}
            onClick={isGroup ? onProfileClick : undefined}
          >
            <UserAvatar
              src={displayProfile}
              name={displayName}
              size="default"
              // online={isPrivate ? isActive : undefined}
            />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                <span className="truncate">{displayName}</span>
                {isMuted && (
                  <span title={muteLabel || "Muted"} className="shrink-0">
                    <BellOff className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </span>
                )}
              </p>
              {isPrivate && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      isActive
                        ? "bg-emerald-400 online-pulse"
                        : "bg-orange-400"
                    )}
                  />
                  {isActive ? "Online" : "Offline"}
                </p>
              )}
              {isGroup && (
                <p className="text-xs text-muted-foreground">
                  {groupMemberCount} participants
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {!isSelectionMode && (
            <>
              <Button
                variant="ghost"
                size="icon"
                title="Search Messages"
                className="rounded-lg hover:bg-primary/10 hover:text-primary"
                onClick={onSearchOpen}
              >
                <Search className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Media & Documents"
                className="rounded-lg hover:bg-primary/10 hover:text-primary"
                onClick={onMediaListClick}
              >
                <Image className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Pinned Messages"
                className="rounded-lg hover:bg-primary/10 hover:text-primary"
                onClick={onPinnedClick}
              >
                <Pin className="h-4 w-4" />
              </Button>
              {onToggleMute && (
                <Button
                  variant="ghost"
                  size="icon"
                  title={isMuted ? muteLabel || "Muted" : "Mute notifications"}
                  className="rounded-lg hover:bg-primary/10 hover:text-primary"
                  onClick={() =>
                    isMuted ? onToggleMute(false, null) : setMuteDialogOpen(true)
                  }
                >
                  {isMuted ? (
                    <BellOff className="h-4 w-4" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                </Button>
              )}
            </>
          )}
          {canInstall && (
            <Button
              variant="ghost"
              size="icon"
              title="Install App"
              className="rounded-lg hover:bg-primary/10 hover:text-primary"
              onClick={install}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          {isSelectionMode && (
            <>
              {selectedCount > 0 && (
                <span className="text-xs font-medium text-muted-foreground">
                  {selectedCount} selected
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                title="Forward"
                className="rounded-lg hover:bg-primary/10 hover:text-primary"
                onClick={onForwardSelected}
              >
                <Forward className="h-4 w-4" />
              </Button>
              {canDeleteSelected && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete"
                  className="rounded-lg hover:bg-destructive/10 hover:text-destructive"
                  onClick={onDeleteSelected}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Search bar - full width */}
      {isSearchOpen && (
        <div className="flex items-center gap-3 border-b border-primary/15 bg-primary/4 px-4 py-2">
          {/* Input with icon */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-primary/20 bg-background/60 px-3 py-1.5">
            <Search className="h-4 w-4 shrink-0 text-primary/50" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search messages..."
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
            />
            {searchTerm && (
              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium",
                  isSearching || searchResultCount > 0
                    ? "bg-primary/15 text-primary"
                    : "bg-destructive/12 text-destructive"
                )}
              >
                {isSearching
                  ? "..."
                  : searchResultCount > 0
                    ? `${searchResultCount - currentSearchIndex} / ${searchResultCount}`
                    : "No results"}
              </span>
            )}
          </div>

          {/* Nav arrows */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-primary/15 disabled:opacity-30"
              onClick={onSearchPrev}
              disabled={searchResultCount === 0}
            >
              <ChevronUp className="h-4 w-4 text-primary/70" />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-primary/15 disabled:opacity-30"
              onClick={onSearchNext}
              disabled={searchResultCount === 0}
            >
              <ChevronDown className="h-4 w-4 text-primary/70" />
            </button>
          </div>

          {/* Close */}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-destructive/15"
            onClick={onSearchClose}
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      )}

      {onToggleMute && (
        <MuteDialog
          open={muteDialogOpen}
          onOpenChange={setMuteDialogOpen}
          name={displayName}
          onConfirm={(muteUntil) => onToggleMute(true, muteUntil)}
        />
      )}
    </div>
  );
};

export default React.memo(ChatHeader);
