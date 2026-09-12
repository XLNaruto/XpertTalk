import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { fetchPickableUsers, type PickableUser } from "@/lib/events-api";
import {
  displayName,
  toSelectedUser,
  type SelectedUser,
} from "@/lib/event-users";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface ParticipantPickerProps {
  /** Only `active` picks — chips render from this list. */
  value: SelectedUser[];
  onChange: (next: SelectedUser[]) => void;
  /** Users already on the event: shown as checked-and-locked. */
  lockedIds?: string[];
  /** Outlines the list when the field failed validation. */
  invalid?: boolean;
  className?: string;
}

export function ParticipantPicker({
  value,
  onChange,
  lockedIds = [],
  invalid,
  className,
}: ParticipantPickerProps) {
  const [users, setUsers] = useState<PickableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // The picker is mounted with its host dialog, so one fetch per open.
  useEffect(() => {
    let cancelled = false;
    fetchPickableUsers().then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) setUsers(result.data);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const lockedSet = useMemo(
    () => new Set(lockedIds.map((id) => String(id))),
    [lockedIds]
  );
  // Ids arrive as numbers here and strings on the event — normalise both sides
  // or one person ends up with two chips.
  const selectedSet = useMemo(
    () => new Set(value.map((u) => String(u.chatuserId))),
    [value]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) =>
      `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase().includes(term)
    );
  }, [users, search]);

  const toggle = (user: PickableUser) => {
    const id = String(user.chatuserId);
    if (lockedSet.has(id)) return;
    if (selectedSet.has(id)) {
      onChange(value.filter((u) => String(u.chatuserId) !== id));
    } else {
      onChange([...value, toSelectedUser(user)]);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((u) => (
            <span
              key={u.chatuserId}
              className="flex items-center gap-1.5 rounded-full bg-primary/10 py-0.5 pl-1 pr-2 text-xs font-medium text-primary"
            >
              <UserAvatar src={u.profileUrl} name={displayName(u)} size="sm" />
              {displayName(u)}
              <button
                type="button"
                aria-label={`Remove ${displayName(u)}`}
                className="cursor-pointer rounded-full p-0.5 hover:bg-primary/20"
                onClick={() =>
                  onChange(
                    value.filter(
                      (x) => String(x.chatuserId) !== String(u.chatuserId)
                    )
                  )
                }
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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      <ScrollArea
        className={cn(
          "h-48 rounded-lg border bg-popover",
          invalid ? "border-destructive" : "border-border"
        )}
      >
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="p-4 text-center text-xs text-destructive">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            No people found.
          </p>
        ) : (
          <div className="p-1">
            {filtered.map((user) => {
              const id = String(user.chatuserId);
              const locked = lockedSet.has(id);
              const checked = locked || selectedSet.has(id);
              return (
                <label
                  key={id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    locked
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer hover:bg-accent"
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={locked}
                    onCheckedChange={() => toggle(user)}
                  />
                  <UserAvatar
                    src={user.profileUrl}
                    name={displayName(user)}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {displayName(user)}
                  </span>
                  {locked && (
                    <span className="text-[10px] text-muted-foreground">
                      Already added
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
