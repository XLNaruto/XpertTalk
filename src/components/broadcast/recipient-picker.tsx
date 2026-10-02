import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import {
  fetchBroadcastCandidates,
  MAX_MEMBERS,
  type Candidate,
} from "@/lib/broadcast-api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PAGE = 25;

interface RecipientPickerProps {
  /** Omit on the create screen — the list doesn't exist yet. */
  broadcastlistId?: string;
  value: Candidate[];
  onChange: (next: Candidate[]) => void;
  className?: string;
}

/**
 * Candidates come from the server, paged and searched there — the same people
 * the "new chat" list offers. People already on the list arrive `inList` and
 * are shown as added. Selection is capped at the room left on the list.
 */
export function RecipientPicker({
  broadcastlistId,
  value,
  onChange,
  className,
}: RecipientPickerProps) {
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebouncedValue(term.trim(), 300);
  const [rows, setRows] = useState<Candidate[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // `null` until the server says; on create it stays null → 256.
  const [remaining, setRemaining] = useState<number | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const req = ++requestRef.current;
      setLoading(true);
      setError(null);
      const result = await fetchBroadcastCandidates({
        broadcastlistId,
        term: debouncedTerm,
        limit: PAGE,
        offset,
      });
      // A newer search superseded this one.
      if (req !== requestRef.current) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRows((prev) => {
        if (offset === 0) return result.data.list;
        const seen = new Set(prev.map((r) => r.chatuserId));
        return [...prev, ...result.data.list.filter((r) => !seen.has(r.chatuserId))];
      });
      setHasMore(result.data.pagination.hasMore);
      if (result.data.listState) setRemaining(result.data.listState.remaining);
    },
    [broadcastlistId, debouncedTerm]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const capacity = remaining ?? MAX_MEMBERS;
  const selectedIds = new Set(value.map((v) => v.chatuserId));
  const full = value.length >= capacity;

  const toggle = (c: Candidate) => {
    if (c.inList) return;
    if (selectedIds.has(c.chatuserId)) {
      onChange(value.filter((v) => v.chatuserId !== c.chatuserId));
      return;
    }
    if (full) return;
    onChange([...value, c]);
  };

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasMore && !loading && el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      load(rows.length);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      {value.length > 0 && (
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {value.map((u) => (
            <span
              key={u.chatuserId}
              className="flex items-center gap-1.5 rounded-full bg-primary/10 py-0.5 pl-1 pr-2 text-xs font-medium text-primary"
            >
              <UserAvatar src={u.profile || undefined} name={u.name} size="sm" />
              <span className="max-w-[120px] truncate">{u.name}</span>
              <button
                type="button"
                aria-label={`Remove ${u.name}`}
                className="cursor-pointer rounded-full p-0.5 hover:bg-primary/20"
                onClick={() => onChange(value.filter((x) => x.chatuserId !== u.chatuserId))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          placeholder="Search people..."
          className="h-9 pl-9"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <span>
          {value.length > 0 ? `${value.length} selected` : "Select people"}
        </span>
        <span className={cn(full && "font-medium text-amber-600 dark:text-amber-400")}>
          {full
            ? "List is full"
            : `${capacity - value.length} more can be added`}
        </span>
      </div>

      <div
        className="h-56 min-h-0 overflow-y-auto rounded-lg border border-border bg-popover"
        onScroll={onScroll}
      >
        {error && rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-xs text-destructive">{error}</p>
            <Button variant="outline" size="xs" onClick={() => load(0)}>
              Retry
            </Button>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 p-4 text-center text-muted-foreground">
            <Search className="h-5 w-5 opacity-50" />
            <p className="text-xs">
              {debouncedTerm ? `No one matches "${debouncedTerm}"` : "No people found."}
            </p>
          </div>
        ) : (
          <div className="p-1">
            {rows.map((c) => {
              const checked = c.inList || selectedIds.has(c.chatuserId);
              const disabled = c.inList || (!checked && full);
              return (
                <label
                  key={c.chatuserId}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent"
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => toggle(c)}
                  />
                  <UserAvatar src={c.profile || undefined} name={c.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{c.name || "Unknown"}</span>
                  {c.inList && (
                    <span className="text-[10px] font-medium text-muted-foreground">Added</span>
                  )}
                </label>
              );
            })}
            {loading && (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
