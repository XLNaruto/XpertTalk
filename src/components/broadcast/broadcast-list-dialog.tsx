import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  addBroadcastMembers,
  createBroadcastList,
  LIST_NAME_MAX,
  renameBroadcastList,
  type Candidate,
  type CreatedList,
} from "@/lib/broadcast-api";
import { useBroadcastStore } from "@/stores/broadcast-store";
import { RecipientPicker } from "@/components/broadcast/recipient-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ListDialogMode =
  | { kind: "create" }
  | { kind: "rename"; broadcastlistId: string; name: string }
  | { kind: "add"; broadcastlistId: string; name: string };

interface BroadcastListDialogProps {
  mode: ListDialogMode | null;
  onOpenChange: (open: boolean) => void;
  /** Create: the new list. Add/rename: called after success so the host can refresh. */
  onDone?: (created?: CreatedList) => void;
}

const COPY = {
  create: {
    title: "New broadcast list",
    description:
      "Each person gets your message in their own private chat with you. Nobody sees who else it went to.",
  },
  rename: { title: "Rename list", description: "Only you can see this name." },
  add: { title: "Add people", description: "They'll get future broadcasts to this list." },
};

/** The body mounts per open, so all state starts fresh each time. */
export function BroadcastListDialog({ mode, onOpenChange, onDone }: BroadcastListDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const copy = mode ? COPY[mode.kind] : COPY.create;

  return (
    <Dialog open={!!mode} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      {/* Header and footer stay put; only the form between them scrolls. */}
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6 pr-12">
          <DialogTitle>
            {mode?.kind === "add" ? `Add people to ${mode.name}` : copy.title}
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {mode && (
          <ListForm
            key={mode.kind + ("broadcastlistId" in mode ? mode.broadcastlistId : "")}
            mode={mode}
            submitting={submitting}
            setSubmitting={setSubmitting}
            onClose={() => onOpenChange(false)}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ListForm({
  mode,
  submitting,
  setSubmitting,
  onClose,
  onDone,
}: {
  mode: ListDialogMode;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
  onClose: () => void;
  onDone?: (created?: CreatedList) => void;
}) {
  const [name, setName] = useState(mode.kind === "rename" ? mode.name : "");
  const [people, setPeople] = useState<Candidate[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const patchList = useBroadcastStore((s) => s.patchList);
  const removeList = useBroadcastStore((s) => s.removeList);

  const showName = mode.kind !== "add";
  const showPicker = mode.kind !== "rename";
  const trimmed = name.trim();

  const submit = async () => {
    setFormError(null);
    if (showName) {
      if (!trimmed) return setNameError("Give the list a name.");
      if (trimmed.length > LIST_NAME_MAX)
        return setNameError(`Keep the name under ${LIST_NAME_MAX} characters.`);
    }
    if (mode.kind === "add" && people.length === 0) {
      return setFormError("Pick at least one person.");
    }

    setSubmitting(true);
    const ids = people.map((p) => p.chatuserId);

    if (mode.kind === "create") {
      const result = await createBroadcastList(trimmed, ids);
      setSubmitting(false);
      if (!result.ok) return handleFail(result.status, result.message);
      const skipped = result.data.skipped.length;
      toast.success(`"${result.data.name}" created`, {
        description:
          skipped > 0
            ? `${skipped} ${skipped === 1 ? "person" : "people"} couldn't be added.`
            : result.data.memberCount < 2
              ? "Add at least 2 people to make the most of it."
              : undefined,
      });
      onDone?.(result.data);
      onClose();
      return;
    }

    if (mode.kind === "rename") {
      if (trimmed === mode.name) {
        setSubmitting(false);
        onClose();
        return;
      }
      const result = await renameBroadcastList(mode.broadcastlistId, trimmed);
      setSubmitting(false);
      if (!result.ok) return handleFail(result.status, result.message);
      patchList(mode.broadcastlistId, { name: trimmed });
      toast.success("List renamed");
      onDone?.();
      onClose();
      return;
    }

    const result = await addBroadcastMembers(mode.broadcastlistId, ids);
    setSubmitting(false);
    if (!result.ok) return handleFail(result.status, result.message);
    patchList(mode.broadcastlistId, { memberCount: result.data.memberCount });
    const notVisible = (result.data.skipped || []).filter((s) => s.reason === "NOT_VISIBLE").length;
    toast.success(
      `Added ${result.data.added} ${result.data.added === 1 ? "person" : "people"}`,
      notVisible > 0
        ? { description: `${notVisible} couldn't be added.` }
        : undefined
    );
    onDone?.();
    onClose();
  };

  const handleFail = (status: number | null, message: string) => {
    if (status === 409) {
      setNameError(message);
      return;
    }
    if (status === 404 && mode.kind !== "create") {
      toast.error(message);
      removeList(mode.broadcastlistId);
      onClose();
      return;
    }
    setFormError(message);
  };

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {showName && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="broadcast-list-name">Broadcast name</Label>
              <span className="text-[11px] text-muted-foreground">
                {trimmed.length}/{LIST_NAME_MAX}
              </span>
            </div>
            <Input
              id="broadcast-list-name"
              value={name}
              maxLength={LIST_NAME_MAX}
              placeholder="Site supervisors"
              aria-invalid={!!nameError}
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && mode.kind === "rename") submit();
              }}
            />
            {nameError && <p className="text-xs font-medium text-destructive">{nameError}</p>}
          </div>
        )}

        {showPicker && (
          <div className="space-y-1.5">
            {showName && <Label>Recipients</Label>}
            <RecipientPicker
              broadcastlistId={mode.kind === "add" ? mode.broadcastlistId : undefined}
              value={people}
              onChange={(next) => {
                setPeople(next);
                setFormError(null);
              }}
            />
            {mode.kind === "create" && people.length === 1 && (
              <p className="text-[11px] text-muted-foreground">
                Tip: a broadcast is most useful with at least 2 people.
              </p>
            )}
          </div>
        )}

        {formError && <p className="text-xs font-medium text-destructive">{formError}</p>}
      </div>

      <DialogFooter className="shrink-0 border-t border-border bg-background px-6 py-3">
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={submitting || (mode.kind === "add" && people.length === 0)}
          className="[.dark:not(.accent-black)_&]:text-white"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode.kind === "create"
            ? "Create list"
            : mode.kind === "rename"
              ? "Save"
              : `Add${people.length ? ` ${people.length}` : ""}`}
        </Button>
      </DialogFooter>
    </>
  );
}
