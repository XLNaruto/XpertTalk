import React, { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { Camera, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

import { apiHeader, getData, postData } from "@/lib/api-helper";
import { cn } from "@/lib/utils";

import { UserAvatar } from "@/components/shared/user-avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

// userStage removed — endpoints now use common prefix

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupCreated: (data: {
    talkId: string;
    talkType: string;
    name: string;
    profile: string;
  }) => void;
}

interface UserItem {
  chatuserId: string;
  firstName: string;
  lastName: string;
  profileUrl: string;
}

// ── Memoized user row ──────────────────────────────────────────────
const UserRow = React.memo(function UserRow({
  user,
  selected,
  onToggle,
}: {
  user: UserItem;
  selected: boolean;
  onToggle: (user: UserItem) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        selected ? "bg-primary/8" : "hover:bg-muted/60"
      )}
      onClick={() => onToggle(user)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(user); } }}
    >
      <UserAvatar src={user.profileUrl} name={user.firstName} size="default" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        {user.firstName} {user.lastName}
      </span>
      <Checkbox
        checked={selected}
        tabIndex={-1}
        className="pointer-events-none shrink-0 size-5 rounded-full border-border data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      />
    </div>
  );
});

export function CreateGroupDialog({
  open,
  onOpenChange,
  onGroupCreated,
}: CreateGroupDialogProps) {
  const [groupName, setGroupName] = useState("");
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [userList, setUserList] = useState<UserItem[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserItem[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [deferredSearch, setDeferredSearch] = useState("");

  const [errors, setErrors] = useState<{ groupName?: string; profile?: string; members?: string }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch available users when dialog opens
  useEffect(() => {
    if (open) {
      fetchUsers();
      setGroupName("");
      setProfileFile(null);
      setProfilePreview("");
      setSelectedUsers([]);
      setSearchInput("");
      setDeferredSearch("");
      setErrors({});
    }
  }, [open]);

  const fetchUsers = async () => {
    const response: any = await getData(
      "chat/talk/users",
      {},
      apiHeader(false, 0)
    );
    if (
      String(response?.status) === "200" &&
      String(response?.data.status) === "200"
    ) {
      setUserList(response.data.data);
    }
  };

  // Debounce search via startTransition
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    startTransition(() => {
      setDeferredSearch(value);
    });
  }, []);

  // Filter users based on deferred search (low priority)
  const filteredUsers = useMemo(() => {
    if (!deferredSearch) return userList;
    const term = deferredSearch.toLowerCase();
    return userList.filter((item) =>
      Object.values(item).some((val) =>
        String(val).toLowerCase().includes(term)
      )
    );
  }, [userList, deferredSearch]);

  // Build a Set for O(1) lookup
  const selectedSet = useMemo(() => {
    const s = new Set<string>();
    for (const u of selectedUsers) s.add(u.chatuserId);
    return s;
  }, [selectedUsers]);

  // Handle image crop (square)
  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
      toast.error("Please upload a valid image (JPG, PNG)");
      return;
    }

    setProfileLoading(true);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setProfileLoading(false);
        return;
      }
      const size = Math.min(img.width, img.height);
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(
        img,
        (img.width - size) / 2,
        (img.height - size) / 2,
        size, size, 0, 0, size, size
      );
      canvas.toBlob((blob) => {
        if (blob) {
          const croppedFile = new File([blob], file.name, { type: file.type });
          const previewUrl = URL.createObjectURL(croppedFile);
          // Batch both state updates
          setProfileFile(croppedFile);
          setProfilePreview(previewUrl);
          setErrors((prev) => ({ ...prev, profile: undefined }));
        }
        URL.revokeObjectURL(img.src);
        setProfileLoading(false);
      }, file.type);
    };
    img.onerror = () => setProfileLoading(false);
    e.target.value = "";
  }, []);

  // Toggle user selection
  const toggleUser = useCallback((user: UserItem) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((s) => s.chatuserId === user.chatuserId);
      if (exists) {
        return prev.filter((s) => s.chatuserId !== user.chatuserId);
      }
      return [...prev, user];
    });
    setErrors((prev) => ({ ...prev, members: undefined }));
  }, []);

  // Remove from chips
  const removeUser = useCallback((user: UserItem) => {
    setSelectedUsers((prev) =>
      prev.filter((s) => s.chatuserId !== user.chatuserId)
    );
  }, []);

  // Validate and submit
  const handleSubmit = async () => {
    const newErrors: typeof errors = {};
    if (!groupName.trim()) newErrors.groupName = "Group name is required";
    if (!profileFile) newErrors.profile = "Group image is required";
    if (selectedUsers.length === 0) newErrors.members = "Select at least one member";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", groupName.trim());
      if (profileFile) formData.append("profile", profileFile);
      formData.append(
        "members",
        JSON.stringify(selectedUsers.map((u) => u.chatuserId))
      );

      const response: any = await postData(
        "chat/talk/start/group",
        formData,
        apiHeader(true, 0)
      );

      if (
        String(response?.status) === "200" &&
        String(response?.data?.status) === "200"
      ) {
        const data = response.data.data;
        onOpenChange(false);
        onGroupCreated(data);
        toast.success("Group created successfully");
      } else {
        toast.error("Failed to create group");
      }
    } catch {
      toast.error("Failed to create group");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="min-w-[440px] border-l border-border/50 bg-background p-0 sm:max-w-[550px]"
      >
        {/* Header */}
        <SheetHeader className="border-b border-border/50 px-5 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-semibold text-foreground">
              Create Group
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex h-[calc(100vh-65px)] flex-col overflow-hidden">
          {/* Top fixed section */}
          <div className="shrink-0 flex flex-col gap-5 px-5 pb-3">
            {/* Avatar upload */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                className="group relative h-20 w-20 overflow-hidden rounded-full bg-muted/50 transition-colors hover:bg-muted"
                onClick={() => fileInputRef.current?.click()}
                disabled={profileLoading}
              >
                {profileLoading ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : profilePreview ? (
                  <img
                    src={profilePreview}
                    alt="Group"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Camera className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-5 w-5 text-foreground" />
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png"
                className="hidden"
                onChange={handleImageChange}
              />
              <span className="text-[11px] text-muted-foreground/60">
                Upload group photo
              </span>
              {errors.profile && (
                <p className="text-xs text-destructive">{errors.profile}</p>
              )}
            </div>

            {/* Group name */}
            <div className="space-y-1.5">
              <Input
                placeholder="Group name"
                value={groupName}
                onChange={(e) => {
                  setGroupName(e.target.value);
                  if (e.target.value.trim()) setErrors((prev) => ({ ...prev, groupName: undefined }));
                }}
                className="h-10 rounded-lg border-0 bg-muted/50 text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/30"
              />
              {errors.groupName && (
                <p className="text-xs text-destructive">{errors.groupName}</p>
              )}
            </div>

            {/* Selected members chips */}
            {selectedUsers.length > 0 && (
              <ScrollArea className="max-h-[100px]">
                <div className="flex flex-wrap gap-1.5">
                  {selectedUsers.map((user) => (
                    <div
                      key={`chip-${user.chatuserId}`}
                      className="flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-1.5 pr-2"
                    >
                      <UserAvatar src={user.profileUrl} name={user.firstName} size="sm" />
                      <span className="max-w-[100px] truncate text-xs font-medium text-primary">
                        {user.firstName}
                      </span> 
                      <button
                        type="button"
                        className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
                        onClick={() => removeUser(user)}
                      >
                        <X className="h-3 w-3 text-primary/70" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Member search */}
            <div className="space-y-1.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  placeholder="Search members..."
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="flex h-9 w-full rounded-lg border-0 bg-muted/50 pl-9 pr-8 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/30"
                />
                {searchInput && (
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => handleSearchChange("")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              {errors.members && (
                <p className="text-xs text-destructive">{errors.members}</p>
              )}
            </div>
          </div>

          {/* Member list — fills remaining space and scrolls */}
          <ScrollArea className="min-h-0 flex-1 px-5">
            <div className="space-y-0.5 pb-2">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <UserRow
                    key={user.chatuserId}
                    user={user}
                    selected={selectedSet.has(user.chatuserId)}
                    onToggle={toggleUser}
                  />
                ))
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground/60">
                  No users found
                </p>
              )}
            </div>
          </ScrollArea>

          {/* Submit — pinned at bottom */}
          <div className="shrink-0 border-t border-border/50 px-5 py-4">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="h-10 w-full rounded-lg bg-gradient-to-r from-[var(--chat-gradient-from)] to-[var(--chat-gradient-to)] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                `Create Group${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ""}`
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
