import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FilePreview } from "@/components/chat/file-preview";
import useFileUpload from "@/hooks/use-file-upload";
import { cn } from "@/lib/utils";
import {
  mintClientMsgId,
  mintOptionId,
  POLL_MAX_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  validatePollDraft,
  type PollDraftOption,
} from "@/lib/polls";

type Emit = (event: string, data?: any, ack?: (response: any) => void) => boolean;

/** No ack in this long → the send was lost; retrying is safe (same clientMsgId). */
const ACK_TIMEOUT_MS = 10_000;

/** The server caps a message at 10 attachments; the picker enforces it too. */
const MAX_ATTACHMENTS = 10;

/**
 * Attaching photos/videos to a poll question is supported end to end — the
 * upload, the emit and the bubble rendering all handle it — but the composer
 * does not offer it. Flip this to show the picker again. Polls that arrive WITH
 * attachments (from the mobile app, say) still render them either way.
 */
const POLL_ATTACHMENTS_ENABLED: boolean = false;

interface PollComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emit: Emit;
  isConnected: boolean;
  /** Optional — a poll replies exactly like a text message. */
  replyToMessageId?: string | null;
  onSent?: () => void;
}

function emptyOption(): PollDraftOption {
  return { optionId: mintOptionId(), text: "" };
}

export function PollComposeDialog({
  open,
  onOpenChange,
  emit,
  isConnected,
  replyToMessageId,
  onSent,
}: PollComposeDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
    >
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New poll</DialogTitle>
          <DialogDescription>
            Everyone in this chat can vote and see the results.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every field — including the
            `clientMsgId` — is initialised once per dialog instance. */}
        {open && (
          <PollForm
            emit={emit}
            isConnected={isConnected}
            replyToMessageId={replyToMessageId}
            submitting={submitting}
            setSubmitting={setSubmitting}
            onDone={() => {
              onOpenChange(false);
              onSent?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PollForm({
  emit,
  isConnected,
  replyToMessageId,
  submitting,
  setSubmitting,
  onDone,
}: {
  emit: Emit;
  isConnected: boolean;
  replyToMessageId?: string | null;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onDone: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<PollDraftOption[]>(() => [
    emptyOption(),
    emptyOption(),
  ]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [questionError, setQuestionError] = useState<string>();
  const [optionsError, setOptionsError] = useState<string>();
  const [duplicates, setDuplicates] = useState<number[]>([]);
  const [formError, setFormError] = useState<string>();

  // One id for the life of this dialog: a re-emit (a double-click we failed to
  // guard, a reconnect mid-send) is then a LOOKUP, not a second poll. Two
  // bubbles would split the tally and nothing anywhere would report it.
  const clientMsgIdRef = useRef(mintClientMsgId());
  const optionRefs = useRef<Array<HTMLInputElement | null>>([]);
  // Media already stored server-side. A retry after a REJECTED create reuses
  // these rather than uploading the same files a second time.
  const uploadedIdsRef = useRef<string[] | null>(null);

  // The same upload the composer uses — there is no poll-specific route, and
  // this brings the type/size validation and the picker along with it.
  const {
    selectedFiles,
    isUploading,
    fileInputRef,
    removeFile,
    uploadSelection,
    openFilePicker,
    handleFileChange,
    isImage,
  } = useFileUpload({ emit, isConnected });

  const clearErrors = useCallback(() => {
    setQuestionError(undefined);
    setOptionsError(undefined);
    setDuplicates([]);
    setFormError(undefined);
  }, []);

  const setOptionText = (index: number, text: string) => {
    setOptions((prev) =>
      prev.map((option, i) => (i === index ? { ...option, text } : option))
    );
    clearErrors();
  };

  const addOption = () => {
    if (options.length >= POLL_MAX_OPTIONS) return;
    setOptions((prev) => [...prev, emptyOption()]);
    clearErrors();
    // Focus the row that is about to appear.
    requestAnimationFrame(() => optionRefs.current[options.length]?.focus());
  };

  const removeOption = (index: number) => {
    // Blank rows are dropped on submit, so the floor here is only about keeping
    // the form usable, not about validity.
    if (options.length <= 2) {
      setOptionText(index, "");
      return;
    }
    setOptions((prev) => prev.filter((_, i) => i !== index));
    clearErrors();
  };

  const handleOptionKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const next = optionRefs.current[index + 1];
    if (next) next.focus();
    else addOption();
  };

  const submit = async () => {
    if (submitting || isUploading) return;
    clearErrors();

    const result = validatePollDraft(question, options, allowMultiple);
    if (!result.ok || !result.payload) {
      setQuestionError(result.questionError);
      setOptionsError(result.optionsError);
      setDuplicates(result.duplicateIndexes);
      return;
    }

    setSubmitting(true);

    // Upload BEFORE the emit. A poll can never be edited, so emitting after a
    // failed upload would strand a poll with no images and no way to add them.
    let mediaIds = uploadedIdsRef.current;
    if (selectedFiles.length > 0 && !mediaIds) {
      mediaIds = await uploadSelection();
      if (!mediaIds) {
        // `uploadSelection` has already explained why.
        setSubmitting(false);
        return;
      }
      uploadedIdsRef.current = mediaIds;
    }

    let settled = false;
    const finish = () => {
      if (settled) return true;
      settled = true;
      return false;
    };

    const timeout = setTimeout(() => {
      if (finish()) return;
      setSubmitting(false);
      setFormError("Couldn't create the poll. Please try again.");
    }, ACK_TIMEOUT_MS);

    // The server derives `messageType`, sets the message text from the question
    // and stamps the time — so no `messageType`, no `message`, no `created`.
    const sent = emit(
      "sendMessage",
      {
        clientMsgId: clientMsgIdRef.current,
        // Upload order is display order — pass the ids straight through.
        ...(mediaIds?.length ? { mediaIds } : {}),
        poll: result.payload,
        ...(replyToMessageId ? { replyToMessageId } : {}),
      },
      (ack: any) => {
        clearTimeout(timeout);
        if (finish()) return;

        if (ack?.success) {
          // The poll arrives in the list on the `newMessage` broadcast, which
          // carries the same `clientMsgId` and is de-duplicated there.
          onDone();
          return;
        }

        // A rejected create writes NOTHING server-side — no orphan message, no
        // empty bubble. Keep the dialog open and show the server's wording.
        setSubmitting(false);
        setFormError(ack?.message || "Couldn't create the poll. Please try again.");
      }
    );

    if (!sent) {
      clearTimeout(timeout);
      if (finish()) return;
      setSubmitting(false);
      setFormError("You're offline — the poll wasn't sent.");
    }
  };

  const trimmedQuestion = question.trim();

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="poll-question">Question</Label>
          <span className="text-[11px] text-muted-foreground">
            {trimmedQuestion.length}/{POLL_QUESTION_MAX}
          </span>
        </div>
        <Input
          id="poll-question"
          autoFocus
          value={question}
          maxLength={POLL_QUESTION_MAX}
          placeholder="Ask something…"
          aria-invalid={!!questionError}
          onChange={(e) => {
            setQuestion(e.target.value);
            clearErrors();
          }}
        />
        {questionError && (
          <p className="text-xs font-medium text-destructive">{questionError}</p>
        )}
      </div>

      {/* Attachments ride on the question, not on any option. */}
      {POLL_ATTACHMENTS_ENABLED && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Photos & videos</Label>
            <span className="text-[11px] text-muted-foreground">
              {selectedFiles.length}/{MAX_ATTACHMENTS}
            </span>
          </div>

          {selectedFiles.length > 0 && (
            <FilePreview
              files={selectedFiles}
              onRemove={(index) => {
                removeFile(index);
                // The stored upload no longer matches the selection.
                uploadedIdsRef.current = null;
              }}
              isImage={isImage}
              className="px-0 pb-0 pt-1"
            />
          )}

          {selectedFiles.length < MAX_ATTACHMENTS && (
            <button
              type="button"
              onClick={openFilePicker}
              disabled={submitting}
              className="flex cursor-pointer items-center gap-1.5 pt-0.5 text-xs font-semibold text-primary transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              {selectedFiles.length > 0 ? "Add more" : "Attach photos or videos"}
            </button>
          )}

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={(e) => {
              handleFileChange(e);
              uploadedIdsRef.current = null;
            }}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Options</Label>
          <span className="text-[11px] text-muted-foreground">
            {options.length}/{POLL_MAX_OPTIONS}
          </span>
        </div>

        {/* Each option is ONE field: the number, the text and the remove control
            share a bordered row, so the list reads as a list rather than a
            stack of inputs with something floating beside them. */}
        <div className="space-y-2">
          {options.map((option, index) => {
            const invalid = duplicates.includes(index);
            // Blank rows are dropped on submit, so the only reason to keep a
            // remove control off an empty row is that there is nothing to undo.
            const removable = !!option.text || options.length > 2;

            return (
              <div
                key={option.optionId}
                className={cn(
                  "group/row flex h-10 items-center gap-2 rounded-lg border bg-transparent pl-2.5 pr-1.5 shadow-xs transition-[color,box-shadow] dark:bg-input/30",
                  "focus-within:ring-[3px]",
                  invalid
                    ? "border-destructive ring-destructive/20 dark:ring-destructive/40"
                    : "border-input focus-within:border-ring focus-within:ring-ring/50"
                )}
              >
                {/* Fills in as the row is written: a solid brand chip once it
                    has text, a quiet tint while it is still empty. */}
                <span
                  className={cn(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums transition-colors",
                    option.text
                      ? "bg-primary text-white shadow-sm"
                      : "bg-primary/12 text-primary/60"
                  )}
                >
                  {index + 1}
                </span>

                <input
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  value={option.text}
                  maxLength={POLL_OPTION_MAX}
                  placeholder={`Option ${index + 1}`}
                  onChange={(e) => setOptionText(index, e.target.value)}
                  onKeyDown={(e) => handleOptionKeyDown(e, index)}
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />

                {/* Near the cap, how much room is left — a badge rather than a
                    bare number, so it can't be read as part of the answer, and
                    it warms up as the limit closes in. */}
                {option.text.length > POLL_OPTION_MAX - 20 &&
                  (() => {
                    const left = POLL_OPTION_MAX - option.text.length;
                    return (
                      <span
                        title={`${left} characters left`}
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-[2px] text-[10px] font-bold tabular-nums",
                          left === 0
                            ? "bg-destructive/15 text-destructive"
                            : left <= 10
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : "bg-foreground/[0.08] text-muted-foreground"
                        )}
                      >
                        {left}
                      </span>
                    );
                  })()}

                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  aria-label={`Remove option ${index + 1}`}
                  tabIndex={removable ? 0 : -1}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all",
                    "hover:bg-destructive/10 hover:text-destructive",
                    // Dimmed rather than hidden: a hover-only control is
                    // unreachable on a touch screen.
                    removable
                      ? "cursor-pointer opacity-50 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
                      : "pointer-events-none opacity-0"
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Sized to its label — a secondary action, not another full-width row.
            The remaining-count lives in the header above. */}
        {options.length < POLL_MAX_OPTIONS && (
          <button
            type="button"
            onClick={addOption}
            className={cn(
              "group/add ml-auto flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input py-0 pl-1.5 pr-3 transition-colors",
              "hover:border-primary/60 hover:bg-primary/5"
            )}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary transition-colors group-hover/add:bg-primary group-hover/add:text-white">
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            </span>
            <span className="text-[13px] font-medium text-muted-foreground transition-colors group-hover/add:text-primary">
              Add option
            </span>
          </button>
        )}

        {optionsError && (
          <p className="text-xs font-medium text-destructive">{optionsError}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
        <div className="min-w-0">
          <Label htmlFor="poll-multiple" className="cursor-pointer">
            Allow multiple answers
          </Label>
          <p className="text-[11px] text-muted-foreground">
            People can pick more than one option.
          </p>
        </div>
        <Switch
          id="poll-multiple"
          checked={allowMultiple}
          onCheckedChange={(next) => {
            setAllowMultiple(next);
            clearErrors();
          }}
        />
      </div>

      {formError && (
        <p className="text-xs font-medium text-destructive">{formError}</p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={submitting || isUploading}
          className="dark:text-white"
        >
          {(submitting || isUploading) && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {isUploading ? "Uploading…" : "Send poll"}
        </Button>
      </DialogFooter>
    </>
  );
}

export default PollComposeDialog;
