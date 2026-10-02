import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Megaphone,
  MoreVertical,
  Check,
  RefreshCw,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteBroadcastList,
  LIST_NAME_MAX,
  renameBroadcastList,
  fetchBroadcastListDetail,
  reasonText,
  removeBroadcastMembers,
  type BroadcastListDetail,
  type BroadcastMember,
  pluralPeople,
} from "@/lib/broadcast-api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useBroadcastStore } from "@/stores/broadcast-store";
import {
  BroadcastListDialog,
  type ListDialogMode,
} from "@/components/broadcast/broadcast-list-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/tooltip";

export function BroadcastListDetailView({ broadcastlistId }: { broadcastlistId: string }) {
  const pop = useBroadcastStore((s) => s.pop);
  const patchList = useBroadcastStore((s) => s.patchList);
  const removeList = useBroadcastStore((s) => s.removeList);
  const refreshLists = useBroadcastStore((s) => s.refreshLists);
  // The summary row gives an instant header while the detail loads.
  const summary = useBroadcastStore((s) =>
    s.lists.find((l) => l.broadcastlistId === broadcastlistId)
  );

  const [detail, setDetail] = useState<BroadcastListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebouncedValue(term.trim(), 300);
  const [dialog, setDialog] = useState<ListDialogMode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  /** The member awaiting a "remove?" confirmation. */
  const [confirmRemove, setConfirmRemove] = useState<BroadcastMember | null>(null);
  // `null` = untouched, so the field follows the saved name.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const requestRef = useRef(0);

  const gone = useCallback(
    (message: string) => {
      // 404 — gone, or not ours. Same thing on purpose.
      toast.error(message);
      removeList(broadcastlistId);
    },
    [broadcastlistId, removeList]
  );

  const load = useCallback(async () => {
    const req = ++requestRef.current;
    setLoading(true);
    const result = await fetchBroadcastListDetail(broadcastlistId, debouncedTerm);
    if (req !== requestRef.current) return;
    setLoading(false);
    if (result.ok) {
      setDetail(result.data);
      setError(null);
      patchList(broadcastlistId, {
        name: result.data.name,
        memberCount: result.data.memberCount,
      });
      return;
    }
    if (result.kind === "rejected" && result.status === 404) {
      gone(result.message);
      return;
    }
    setError(result.message);
  }, [broadcastlistId, debouncedTerm, patchList, gone]);

  useEffect(() => {
    load();
  }, [load]);

  const name = detail?.name || summary?.name || "";
  const memberCount = detail?.memberCount ?? summary?.memberCount ?? 0;
  const maxMembers = detail?.maxMembers ?? summary?.maxMembers ?? 256;
  const undeliverable = (detail?.members || []).filter((m) => !m.isDeliverable).length;

  const removeMember = async (m: BroadcastMember) => {
    setRemoving(m.chatuserId);
    const result = await removeBroadcastMembers(broadcastlistId, [m.chatuserId]);
    setRemoving(null);
    if (!result.ok) {
      if (result.kind === "rejected" && result.status === 404) return gone(result.message);
      toast.error(result.message);
      return;
    }
    setDetail((d) =>
      d
        ? {
            ...d,
            memberCount: result.data.memberCount,
            members: d.members.filter((x) => x.chatuserId !== m.chatuserId),
          }
        : d
    );
    patchList(broadcastlistId, { memberCount: result.data.memberCount });
    toast.success(`Removed ${m.name}`);
  };

  const nameDirty = nameDraft !== null && nameDraft.trim() !== name;

  const saveName = async () => {
    if (!nameDirty || savingName) return;
    const next = (nameDraft || "").trim();
    if (!next) return setNameError("Give the list a name.");
    setSavingName(true);
    const result = await renameBroadcastList(broadcastlistId, next);
    setSavingName(false);
    if (!result.ok) {
      if (result.kind === "rejected" && result.status === 404) return gone(result.message);
      // 409 (name taken) and 422 read best right under the field.
      setNameError(result.message);
      return;
    }
    setDetail((d) => (d ? { ...d, name: next } : d));
    patchList(broadcastlistId, { name: next });
    setNameDraft(null);
    toast.success("List renamed");
  };

  const doDelete = async () => {
    const result = await deleteBroadcastList(broadcastlistId);
    if (!result.ok && !(result.kind === "rejected" && result.status === 404)) {
      toast.error(result.message);
      return;
    }
    toast.success(`"${name}" deleted`, { description: "Its past broadcasts stay in History." });
    removeList(broadcastlistId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-border bg-popover px-2 py-2.5 pr-12">
        <Button variant="ghost" size="icon-sm" onClick={pop} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-tight text-foreground">
            {name || "Broadcast list"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {memberCount}/{maxMembers} recipients
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="List options">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              disabled={memberCount >= maxMembers}
              onClick={() => setDialog({ kind: "add", broadcastlistId, name })}
            >
              <UserPlus className="h-4 w-4" /> Add people
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Delete list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* List hints — only when there's something worth saying. */}
      {(memberCount <= 1 || undeliverable > 0) && (
        <div className="border-b border-border px-4 py-2">
          {memberCount === 0 ? (
            <p className="text-center text-[11px] text-muted-foreground">
              Add people to start broadcasting.
            </p>
          ) : memberCount === 1 ? (
            <p className="text-center text-[11px] text-muted-foreground">
              Add at least 2 people to make the most of a broadcast.
            </p>
          ) : (
            <p className="text-center text-[11px] text-amber-600 dark:text-amber-400">
              {pluralPeople(undeliverable)} won't receive broadcasts — see below.
            </p>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-3">
          <label htmlFor="broadcast-rename" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Broadcast name
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="broadcast-rename"
              value={nameDraft ?? name}
              maxLength={LIST_NAME_MAX}
              aria-invalid={!!nameError}
              className="h-9 flex-1"
              onChange={(e) => {
                setNameDraft(e.target.value);
                setNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setNameDraft(null);
                  setNameError(null);
                }
              }}
            />
            <Button
              size="sm"
              className="[.dark:not(.accent-black)_&]:text-white"
              disabled={!nameDirty || savingName}
              onClick={saveName}
            >
              {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </Button>
          </div>
          {nameError && <p className="mt-1 text-xs font-medium text-destructive">{nameError}</p>}
        </div>

        <div className="flex items-center gap-2 px-4 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search recipients..."
              className="h-9 pl-9"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              autoComplete="off"
            />
          </div>
          <Hint label={memberCount >= maxMembers ? "This list is full" : "Add people"}>
            <Button
              variant="outline"
              size="sm"
              disabled={memberCount >= maxMembers}
              onClick={() => setDialog({ kind: "add", broadcastlistId, name })}
            >
              <UserPlus className="h-4 w-4" />
              Add
            </Button>
          </Hint>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {loading && !detail ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error && !detail ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : (detail?.members.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Megaphone className="h-8 w-8 text-primary" strokeWidth={1.6} />
              <p className="text-sm font-medium text-foreground">
                {debouncedTerm ? "No one matches" : "No recipients yet"}
              </p>
              {!debouncedTerm && (
                <Button
                  size="sm"
                  className="mt-1 [.dark:not(.accent-black)_&]:text-white"
                  onClick={() => setDialog({ kind: "add", broadcastlistId, name })}
                >
                  <UserPlus className="h-4 w-4" />
                  Add people
                </Button>
              )}
            </div>
          ) : (
            <div className={cn("space-y-0.5", loading && "opacity-60")}>
              {detail!.members.map((m) => (
                <MemberRow
                  key={m.chatuserId}
                  member={m}
                  removing={removing === m.chatuserId}
                  onRemove={() => setConfirmRemove(m)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <BroadcastListDialog
        mode={dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        onDone={() => {
          load();
          refreshLists();
        }}
      />
      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        title={`Remove ${confirmRemove?.name || "this person"}?`}
        description="They won't get future broadcasts to this list. Messages already sent stay in their chat."
        confirmText="Remove"
        onConfirm={() => confirmRemove && removeMember(confirmRemove)}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${name}"?`}
        description="The list goes away, but everything already sent stays in each person's chat and in your broadcast history."
        confirmText="Delete"
        onConfirm={doDelete}
      />
    </div>
  );
}

function MemberRow({
  member,
  removing,
  onRemove,
}: {
  member: BroadcastMember;
  removing: boolean;
  onRemove: () => void;
}) {
  // Undeliverable members stay visible, greyed, with the reason — never hidden.
  const reason = member.isDeliverable ? "" : reasonText(member.reason) || "Can't receive broadcasts";
  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/60">
      <UserAvatar
        src={member.profile || undefined}
        name={member.name}
        size="sm"
        className={cn(!member.isDeliverable && "opacity-50 grayscale")}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium",
            member.isDeliverable ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {member.name || "Unknown"}
        </p>
        {reason && (
          <p className="truncate text-[11px] text-amber-600 dark:text-amber-400">{reason}</p>
        )}
      </div>
      <Hint label={`Remove ${member.name}`} className="shrink-0">
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground opacity-100 hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          aria-label={`Remove ${member.name}`}
          disabled={removing}
          onClick={onRemove}
        >
          {removing ? <Loader2 className="animate-spin" /> : <UserMinus />}
        </Button>
      </Hint>
    </div>
  );
}
