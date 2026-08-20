import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Paperclip, SendHorizonal, X, Reply, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMessageWithMentions, formatPreview } from "@/lib/message-formatters";
import useFileUpload from "@/hooks/use-file-upload";
import useDraft from "@/hooks/use-draft";
import type { DraftState } from "@/hooks/use-draft";
import logger from "@/lib/logger";
import { EmojiPickerPopover } from "@/components/chat/emoji-picker-popover";
import { FilePreview } from "@/components/chat/file-preview";
import { MentionList } from "@/components/chat/mention-list";
import { getMediaCount, previewLabel } from "@/lib/media-items";
import { extractFirstUrl, getCachedLinkPreview } from "@/lib/link-preview";
import useLinkPreview from "@/hooks/use-link-preview";
import LinkPreviewCard from "@/components/chat/link-preview-card";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

// ── Types ──

export interface MessageInputProps {
  message: string;
  onMessageChange: (message: string) => void;
  // `isEdit` tells the parent this was an in-place edit, not a new message —
  // an edit must not scroll the list or mark the chat read.
  onSend: (result?: { isEdit?: boolean }) => void;
  isEditing: boolean;
  editingMessageId: string | null;
  /** True when the message being edited carries attachments (editing a caption). */
  editingHasMedia?: boolean;
  onCancelEdit: () => void;
  isReply: boolean;
  replyMessage: any;
  replyMessageId: string | null;
  replyAllMessageIds: string[];
  onCancelReply: () => void;
  mentionMembers: any[];
  emit: (event: string, data?: any, ack?: (response: any) => void) => void;
  isConnected: boolean;
  talkId: string;
  talkType: string;
  onDraftLoaded?: (draft: DraftState | null) => void;
  onFileDragChange?: (isDragging: boolean) => void;
}

export interface MessageInputHandle {
  focus: () => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
}

// ── Caret position helper ──

const MIRROR_PROPS = [
  "direction", "boxSizing", "width", "height", "overflowX", "overflowY",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize",
  "fontSizeAdjust", "lineHeight", "fontFamily", "textAlign", "textTransform",
  "textIndent", "textDecoration", "letterSpacing", "wordSpacing", "tabSize",
  "whiteSpace", "wordWrap", "wordBreak",
] as const;

function getCaretPixelPosition(
  textarea: HTMLTextAreaElement,
  caretIndex: number
): { top: number; left: number } {
  const mirror = document.createElement("div");
  const style = window.getComputedStyle(textarea);

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";

  for (const prop of MIRROR_PROPS) {
    (mirror.style as any)[prop] = (style as any)[prop];
  }

  // Match textarea width exactly
  mirror.style.width = `${textarea.clientWidth}px`;

  const textBefore = textarea.value.substring(0, caretIndex);
  const textNode = document.createTextNode(textBefore);
  mirror.appendChild(textNode);

  const marker = document.createElement("span");
  marker.textContent = "\u200b"; // zero-width space
  mirror.appendChild(marker);

  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  const coords = {
    top: markerRect.top - mirrorRect.top - textarea.scrollTop,
    left: markerRect.left - mirrorRect.left - textarea.scrollLeft,
  };

  document.body.removeChild(mirror);
  return coords;
}

// ── Component ──

const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(
  (
    {
      message,
      onMessageChange,
      onSend,
      isEditing,
      editingMessageId,
      editingHasMedia,
      onCancelEdit,
      isReply,
      replyMessage,
      replyMessageId,
      replyAllMessageIds,
      onCancelReply,
      mentionMembers,
      emit,
      isConnected,
      talkId,
      talkType,
      onDraftLoaded,
      onFileDragChange,
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const inputAreaRef = useRef<HTMLDivElement>(null);
    const [filteredMentions, setFilteredMentions] = useState<any[]>([]);
    const [showMentionList, setShowMentionList] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [mentionPosition, setMentionPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    // ── Typing indicator ──
    const typingRef = useRef(false);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const emitTyping = useCallback(() => {
      if (!isConnected) return;
      if (!typingRef.current) {
        typingRef.current = true;
        emit("typing", {});
      }
      // Reset stop timer on each keystroke
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        typingRef.current = false;
        emit("stopTyping", {});
      }, 2000);
    }, [emit, isConnected]);

    const emitStopTyping = useCallback(() => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (typingRef.current) {
        typingRef.current = false;
        emit("stopTyping", {});
      }
    }, [emit]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      };
    }, []);

    // ── File upload hook ──
    const {
      selectedFiles,
      isFileDragging,
      isUploading,
      fileInputRef,
      restoreFiles,
      removeFile,
      clearFiles,
      uploadFiles,
      openFilePicker,
      handleFileChange,
      handlePaste,
      handleDragOver,
      handleDragEnter,
      handleDragLeave,
      handleDrop,
      isImage,
    } = useFileUpload({ emit, isConnected });

    // ── Link preview while typing ──
    // Debounced so a URL being typed character by character doesn't fire a
    // request per keystroke. Suppressed for attachments (the caption's card
    // would clash with the album grid, matching how bubbles render).
    const debouncedMessage = useDebouncedValue(message, 700);
    const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);

    // An already-resolved URL skips the debounce entirely — its card comes
    // straight from the module cache, so re-opening edit mode on a link that was
    // just previewed shows the card at once instead of after 700ms of nothing.
    const liveUrl = extractFirstUrl(message);
    const previewText =
      liveUrl && getCachedLinkPreview(liveUrl) ? message : debouncedMessage;

    const composerPreview = useLinkPreview(
      previewText,
      selectedFiles.length === 0
    );
    const composerUrl = extractFirstUrl(previewText);
    // Visibility is gated on the LIVE text, not the debounced copy: clearing the
    // composer (send, or closing edit mode) empties `message` at once, and
    // waiting out the 700ms debounce left the card hanging over an empty box.
    // Only the card's CONTENT stays debounced, so typing still doesn't refetch.
    const showComposerPreview =
      !!composerPreview &&
      !!composerUrl &&
      !!liveUrl &&
      dismissedUrl !== composerUrl;

    // ── Draft hook ──
    const { clearDraft } = useDraft({
      talkId,
      state: {
        message,
        attachments: selectedFiles,
        replyMessageId,
        replyMessage,
        isReply,
        isEditing,
        editingMessageId,
      },
      onDraftLoaded: (draft: DraftState | null) => {
        if (draft) {
          onMessageChange(draft.message);
          // Restore (replace), don't append — appending re-runs the 10-file cap
          // and would falsely error "Maximum 10 files" if this fires twice.
          restoreFiles(draft.attachments || []);
          onDraftLoaded?.(draft);
        } else {
          onDraftLoaded?.(null);
        }
      },
    });

    // ── Imperative handle ──
    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      handleDragOver,
      handleDragEnter,
      handleDragLeave,
      handleDrop,
    }));

    // ── Notify parent of drag state ──
    useEffect(() => {
      onFileDragChange?.(isFileDragging);
    }, [isFileDragging]);

    // ── Reset on talkId change ──
    useEffect(() => {
      clearFiles();
      setFilteredMentions([]);
      setShowMentionList(false);
      setDismissedUrl(null);
      // Focus input on chat change and initial load
      setTimeout(() => textareaRef.current?.focus(), 100);
    }, [talkId, clearFiles]);

    // ── Focus when files added ──
    useEffect(() => {
      if (selectedFiles.length > 0) {
        textareaRef.current?.focus();
      }
    }, [selectedFiles.length]);

    // ── Textarea auto-resize ──
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      const maxH = 150;
      if (el.scrollHeight > maxH) {
        el.style.height = `${maxH}px`;
        el.style.overflowY = "auto";
      } else {
        el.style.height = `${el.scrollHeight}px`;
        el.style.overflowY = "hidden";
      }
    }, [message]);

    // ── Emoji ──
    const handleEmojiSelect = useCallback(
      (emoji: string) => {
        onMessageChange(message + emoji);
        textareaRef.current?.focus();
      },
      [message, onMessageChange]
    );

    // ── Mention system ──
    const handleMessageChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        onMessageChange(value);

        if (value.trim()) {
          emitTyping();
        } else {
          emitStopTyping();
        }

        if (talkType !== "GROUP") {
          setShowMentionList(false);
          return;
        }

        const caretPosition = e.target.selectionStart;
        const textUntilCaret = value.slice(0, caretPosition);
        const mentionMatch = textUntilCaret.match(/(?:^|\s)@(\w*)$/);

        if (mentionMatch) {
          const query = mentionMatch[1].toLowerCase();
          // Find already-mentioned names in the message
          const alreadyMentioned = new Set<string>();
          const mentionRegex = /@(\w+)/g;
          let m;
          while ((m = mentionRegex.exec(value)) !== null) {
            alreadyMentioned.add(m[1].toLowerCase());
          }
          // Filter members: match query and not already mentioned
          const matches = mentionMembers.filter(
            (m: any) =>
              m.name.toLowerCase().includes(query) &&
              !alreadyMentioned.has(m.name.toLowerCase())
          );
          // Add @all option if it matches query and not already used
          const allOption = { name: "all", _isAll: true };
          const showAll =
            "all".includes(query) && !alreadyMentioned.has("all");
          const finalList = showAll ? [allOption, ...matches] : matches;
          setFilteredMentions(finalList);
          setShowMentionList(finalList.length > 0);
          setActiveIndex(0);

          // Calculate position of the @ character relative to the input area
          if (finalList.length > 0 && e.target && inputAreaRef.current) {
            const atIndex = caretPosition - mentionMatch[0].trimStart().length;
            const coords = getCaretPixelPosition(e.target, atIndex);
            const textareaRect = e.target.getBoundingClientRect();
            const containerRect = inputAreaRef.current.getBoundingClientRect();
            const dropdownWidth = 224; // w-56 = 14rem = 224px
            let left = textareaRect.left - containerRect.left + coords.left;
            const maxLeft = containerRect.width - dropdownWidth;
            if (left > maxLeft) left = Math.max(0, maxLeft);
            setMentionPosition({
              top: coords.top,
              left,
            });
          }
        } else {
          setShowMentionList(false);
          setFilteredMentions([]);
        }
      },
      [onMessageChange, mentionMembers, talkType, emitTyping, emitStopTyping]
    );

    const handleMentionClick = useCallback(
      (name: string) => {
        const caretPosition = textareaRef.current?.selectionStart || 0;
        const textBefore = message.slice(0, caretPosition);
        const textAfter = message.slice(caretPosition);
        const updatedBefore = textBefore.replace(/@(\w*)$/, `@${name} `);
        onMessageChange(updatedBefore + textAfter);
        setShowMentionList(false);
        setFilteredMentions([]);

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.selectionStart =
              textareaRef.current.selectionEnd = updatedBefore.length;
          }
        }, 0);
      },
      [message, onMessageChange]
    );

    // ── Send / Edit logic ──
    const handleSendClick = useCallback(async () => {
      if (isUploading) return;

      const currentMessage = message;
      const wasEdit = isEditing && !!editingMessageId && selectedFiles.length === 0;

      try {
        if (selectedFiles.length > 0) {
          // Attachments and the typed text go out as ONE message — the text is
          // the album's caption, not a second bubble.
          const caption = currentMessage.trim()
            ? formatMessageWithMentions(currentMessage.trim(), mentionMembers)
            : "";
          const sent = await uploadFiles(talkId, replyMessageId, caption);
          // Upload failed (e.g. one file over its cap rejects the whole batch,
          // nothing stored) — keep the composer as-is so the user can retry.
          if (!sent) return;
        } else if (currentMessage.trim()) {
          if (isEditing && editingMessageId) {
            emit("editMessage", {
              messageId: editingMessageId,
              messageText: formatMessageWithMentions(
                currentMessage.trim(),
                mentionMembers
              ),
            });
          } else if (isConnected) {
            const formattedText = formatMessageWithMentions(
              currentMessage.trim(),
              mentionMembers
            );
            if (replyAllMessageIds.length > 0) {
              // Reply All: send the message once per media item, one-by-one
              // over the socket (small gap keeps server ordering stable).
              for (const id of replyAllMessageIds) {
                emit("sendMessage", {
                  message: formattedText,
                  replyToMessageId: id,
                });
                await new Promise((resolve) => setTimeout(resolve, 50));
              }
            } else {
              const messageData: any = { message: formattedText };
              if (replyMessageId) {
                messageData.replyToMessageId = replyMessageId;
              }
              emit("sendMessage", messageData);
            }
          }
        }

        emitStopTyping();
        clearDraft();
        // The dismissal belongs to the draft that was just sent — keeping it
        // would silently suppress the card the next time the same URL is typed.
        setDismissedUrl(null);
        setShowMentionList(false);
        setFilteredMentions([]);
        onSend({ isEdit: wasEdit });
        textareaRef.current?.focus();
      } catch (error) {
        logger.error("Error in handleSendClick:", error);
      }
    }, [
      isUploading,
      message,
      selectedFiles,
      uploadFiles,
      talkId,
      replyMessageId,
      replyAllMessageIds,
      isEditing,
      editingMessageId,
      emit,
      isConnected,
      mentionMembers,
      emitStopTyping,
      clearDraft,
      onSend,
    ]);

    // ── Key handling ──
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Escape cancels edit/reply
        if (e.key === "Escape") {
          if (isEditing) {
            onCancelEdit();
            return;
          }
          if (isReply) {
            onCancelReply();
            return;
          }
        }

        if (showMentionList) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((prev) => (prev + 1) % filteredMentions.length);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex(
              (prev) =>
                (prev - 1 + filteredMentions.length) % filteredMentions.length
            );
            return;
          }
          if (e.key === "Enter") {
            const selected = filteredMentions[activeIndex];
            if (selected) {
              e.preventDefault();
              handleMentionClick(selected.name);
              return;
            }
          }
          if (e.key === "Escape") {
            setShowMentionList(false);
            return;
          }
        }

        // Enter to send
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSendClick();
        }
      },
      [
        showMentionList,
        filteredMentions,
        activeIndex,
        handleMentionClick,
        handleSendClick,
        isEditing,
        isReply,
        onCancelEdit,
        onCancelReply,
      ]
    );

    const hasContent = message.trim().length > 0 || selectedFiles.length > 0;

    return (
      // <div
      //   className="shrink-0 border-t border-border/50 bg-background"
      //   onDragOver={handleDragOver}
      //   onDragEnter={handleDragEnter}
      //   onDragLeave={handleDragLeave}
      //   onDrop={handleDrop}
      // >
      <div
        className="shrink-0 backgound-image-none chat-bg"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          backgroundImage:"none"
        }}
      >
        {/* Reply bar */}
        {isReply && replyMessage && Object.keys(replyMessage).length > 0 && (
          <div className="flex items-center gap-3 border-y border-border/30 px-4 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Reply className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-primary">
                {replyMessage.senderName}
              </p>
              {/* Caption first, then a media description — a media message can
                  carry text, so `messageType` says nothing about that. */}
              <p
                className="truncate text-xs text-muted-foreground/70"
                dangerouslySetInnerHTML={{
                  __html: formatPreview(previewLabel(replyMessage)),
                }}
              />
            </div>
            {(replyMessage.messageType === "IMAGE" ||
              replyMessage.messageType === "VIDEO") &&
              replyMessage.mediaPath && (
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md">
                  {replyMessage.messageType === "IMAGE" ? (
                    <img
                      src={replyMessage.mediaPath}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <video
                      src={replyMessage.mediaPath}
                      muted
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  )}
                  {/* Previews carry only the FIRST attachment — badge the rest. */}
                  {getMediaCount(replyMessage) > 1 && (
                    <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/60 px-1 text-[9px] font-bold leading-[13px] text-white">
                      +{getMediaCount(replyMessage) - 1}
                    </span>
                  )}
                </div>
              )}
            <button
              type="button"
              onClick={onCancelReply}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Edit bar */}
        {isEditing && editingMessageId && (
          <div className="flex items-center gap-3 border-y border-border/30 px-4 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Pencil className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-primary">
                {editingHasMedia ? "Editing caption" : "Editing"}
              </p>
              <p
                className="truncate text-xs text-muted-foreground/70"
                dangerouslySetInnerHTML={{
                  __html: formatPreview(message.slice(0, 80)),
                }}
              />
            </div>
            <button
              type="button"
              onClick={onCancelEdit}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Link preview of the URL being typed. The row shape keeps the
            composer short — the stacked hero card ate most of the chat's
            vertical space just to preview one link. */}
        {showComposerPreview && (
          <div className="flex items-start gap-2 px-4 pt-3">
            <LinkPreviewCard preview={composerPreview} bare horizontal />
            <button
              type="button"
              title="Remove preview"
              onClick={() => setDismissedUrl(composerUrl)}
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* File preview strip */}
        <FilePreview files={selectedFiles} onRemove={removeFile} isImage={isImage} />

        {/* Input area */}
        <div ref={inputAreaRef} className="relative px-4 py-3">
          {/* Mention list */}
          {showMentionList && (
            <MentionList
              members={filteredMentions}
              activeIndex={activeIndex}
              onSelect={handleMentionClick}
              position={mentionPosition}
            />
          )}

          <div
            className={cn(
              "flex items-end gap-2 rounded-xl bg-muted/50 px-3 py-2 transition-all cursor-text",
              "ring-1 ring-primary/30"
            )}
            onClick={() => textareaRef.current?.focus()}
          >
            {/* Emoji button */}
            <EmojiPickerPopover onEmojiSelect={handleEmojiSelect} />

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              className="max-h-[150px] min-h-[24px] flex-1 resize-none border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              rows={1}
              placeholder={
                selectedFiles.length > 0 || (isEditing && editingHasMedia)
                  ? "Add a caption..."
                  : "Type a message..."
              }
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={isUploading}
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              style={{ overflowY: "hidden" }}
            />

            {/* Attach button */}
            <button
              type="button"
              onClick={openFilePicker}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <Paperclip className="h-5 w-5" />
            </button>

            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={handleFileChange}
            />

            {/* Send button */}
            <button
              type="button"
              onClick={handleSendClick}
              disabled={!hasContent || !isConnected || isUploading}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
                hasContent && isConnected
                  ? "bg-gradient-to-br from-[var(--chat-gradient-from)] to-[var(--chat-gradient-to)] text-white shadow-sm hover:shadow-md"
                  : "text-muted-foreground/40"
              )}
            >
              <SendHorizonal className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }
);

MessageInput.displayName = "MessageInput";

export default MessageInput;
