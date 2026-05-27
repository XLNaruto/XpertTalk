import React, { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import {
  Camera,
  Loader2,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { apiHeader, postData } from "@/lib/api-helper";
import { getEncodedCookie } from "@/lib/encryption";
import { cn } from "@/lib/utils";

import { UserAvatar } from "@/components/shared/user-avatar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MemberList, type GroupMember } from "@/components/group/member-list";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

// userStage removed — endpoints now use common prefix

interface GroupManagementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  talkId: string;
  talkName: string;
  talkProfile: string;
  isGroupAdmin: boolean;
  onGroupUpdated: (data: { talkName?: string; members?: GroupMember[] }) => void;
}

interface AddableMember {
  chatuserId: string;
  name: string;
  profile: string;
  isGroupAdmin?: boolean;
}

export function GroupManagementSheet({
  open,
  onOpenChange,
  talkId,
  talkName,
  talkProfile,
  isGroupAdmin,
  onGroupUpdated,
}: GroupManagementSheetProps) {
  const chatuserId = getEncodedCookie("chatuserId") || "";

  // Profile tab state
  const [groupNameInput, setGroupNameInput] = useState(talkName);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState(talkProfile);
  const [profileLoading, setProfileLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Members — single source of truth, filter via useMemo
  const [allMembers, setAllMembers] = useState<GroupMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [deferredMemberSearch, setDeferredMemberSearch] = useState("");

  // Add members — single source of truth
  const [allAddable, setAllAddable] = useState<AddableMember[]>([]);
  const [addSearch, setAddSearch] = useState("");
  const [deferredAddSearch, setDeferredAddSearch] = useState("");

  // Confirmation
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmText: string;
    action: () => Promise<void>;
  }>({ open: false, title: "", description: "", confirmText: "", action: async () => {} });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync when props change
  useEffect(() => {
    setGroupNameInput(talkName);
  }, [talkName]);

  useEffect(() => {
    setProfilePreview(talkProfile);
    setProfileFile(null);
  }, [talkProfile]);

  // Fetch data when opened
  useEffect(() => {
    if (open && talkId) {
      fetchGroupData(talkId);
      fetchAddableMembers(talkId);
      setMemberSearch("");
      setDeferredMemberSearch("");
      setAddSearch("");
      setDeferredAddSearch("");
    }
  }, [open, talkId]);

  // ── API calls ──

  const fetchGroupData = async (id: string) => {
    const response: any = await postData(
      "chat/talk/group/detail",
      { id },
      apiHeader(false, 0)
    );
    if (
      String(response?.status) === "200" &&
      String(response?.data.status) === "200"
    ) {
      const data = response.data.data;
      setAllMembers(data.members);
      onGroupUpdated({ members: data.members, talkName: data.name });
    }
  };

  const fetchAddableMembers = async (id: string) => {
    const response: any = await postData(
      "chat/talk/member/add/list",
      { id },
      apiHeader(false, 0)
    );
    if (
      String(response?.status) === "200" &&
      String(response?.data.status) === "200"
    ) {
      setAllAddable(response.data.data);
    }
  };

  // ── Search with startTransition for smooth typing ──

  const handleMemberSearch = useCallback((value: string) => {
    setMemberSearch(value);
    startTransition(() => setDeferredMemberSearch(value));
  }, []);

  const handleAddSearch = useCallback((value: string) => {
    setAddSearch(value);
    startTransition(() => setDeferredAddSearch(value));
  }, []);

  // ── Filtered lists via useMemo (no extra state) ──

  const filteredMembers = useMemo(() => {
    if (!deferredMemberSearch) return allMembers;
    const term = deferredMemberSearch.toLowerCase();
    return allMembers.filter((m) =>
      Object.values(m).some((v) => String(v).toLowerCase().includes(term))
    );
  }, [allMembers, deferredMemberSearch]);

  const filteredAddable = useMemo(() => {
    if (!deferredAddSearch) return allAddable;
    const term = deferredAddSearch.toLowerCase();
    return allAddable.filter((m) =>
      Object.values(m).some((v) => String(v).toLowerCase().includes(term))
    );
  }, [allAddable, deferredAddSearch]);

  // ── Image crop ──

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
          setProfileFile(croppedFile);
          setProfilePreview(URL.createObjectURL(croppedFile));
        }
        URL.revokeObjectURL(img.src);
        setProfileLoading(false);
      }, file.type);
    };
    img.onerror = () => setProfileLoading(false);
    e.target.value = "";
  }, []);

  // ── Save profile ──

  const handleSaveProfile = async () => {
    if (!groupNameInput.trim()) {
      toast.error("Group name is required");
      return;
    }

    setSaving(true);
    const formData = new FormData();
    formData.append("id", talkId);
    formData.append("name", groupNameInput.trim());
    if (profileFile) {
      formData.append("profile", profileFile);
    }

    const response: any = await postData(
      "chat/talk/update/group",
      formData,
      apiHeader(true, 0)
    );

    if (
      String(response?.status) === "200" &&
      String(response?.data.status) === "200"
    ) {
      toast.success("Group updated");
      onGroupUpdated({ talkName: groupNameInput.trim() });
      onOpenChange(false);
    } else {
      toast.error("Failed to update group");
    }
    setSaving(false);
  };

  // ── Member actions with confirmation ──

  const handleRemoveMember = useCallback(
    (talkparticipantId: string) => {
      setConfirmState({
        open: true,
        title: "Remove Member",
        description: "Do you want to remove this member from the group?",
        confirmText: "Remove",
        action: async () => {
          const response: any = await postData(
            "chat/talk/member/remove",
            { talkparticipantId },
            apiHeader(false, 0)
          );
          if (
            String(response?.status) === "200" &&
            String(response?.data.status) === "200"
          ) {
            toast.success("Member removed");
            fetchGroupData(talkId);
            fetchAddableMembers(talkId);
          } else {
            toast.error("Failed to remove member");
          }
        },
      });
    },
    [talkId]
  );

  const handleToggleAdmin = useCallback(
    (talkparticipantId: string, currentIsAdmin: boolean) => {
      setConfirmState({
        open: true,
        title: currentIsAdmin ? "Remove Admin" : "Make Admin",
        description: `Do you want to ${currentIsAdmin ? "remove admin privileges from" : "make"} this member ${currentIsAdmin ? "" : "an admin"}?`,
        confirmText: "Yes",
        action: async () => {
          const response: any = await postData(
            "chat/talk/member/toggle/admin",
            { talkparticipantId, isGroupAdmin: !currentIsAdmin },
            apiHeader(false, 0)
          );
          if (
            String(response?.status) === "200" &&
            String(response?.data.status) === "200"
          ) {
            toast.success(currentIsAdmin ? "Admin removed" : "Admin added");
            fetchGroupData(talkId);
          } else {
            toast.error("Failed to update admin status");
          }
        },
      });
    },
    [talkId]
  );

  const handleAddMember = useCallback(
    (memberChatuserId: string) => {
      setConfirmState({
        open: true,
        title: "Add Member",
        description: "Do you want to add this member to the group?",
        confirmText: "Add",
        action: async () => {
          const response: any = await postData(
            "chat/talk/member/add",
            { id: talkId, chatuserId: memberChatuserId },
            apiHeader(false, 0)
          );
          if (
            String(response?.status) === "200" &&
            String(response?.data.status) === "200"
          ) {
            toast.success("Member added");
            fetchGroupData(talkId);
            fetchAddableMembers(talkId);
          } else {
            toast.error("Failed to add member");
          }
        },
      });
    },
    [talkId]
  );

  const executeConfirm = async () => {
    await confirmState.action();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="min-w-[400px] border-l border-border/50 bg-background p-0 sm:max-w-[450px]"
        >
          {/* Header */}
          <SheetHeader className="border-b border-border/50 px-5 py-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-semibold text-foreground">
                Group Info
              </SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          <Tabs defaultValue="profile" className="flex h-[calc(100%-65px)] flex-col">
            <div className="px-5 pt-3">
              <TabsList className="w-full rounded-lg bg-muted/50">
                <TabsTrigger value="profile" className="flex-1 gap-1.5 rounded-md text-xs">
                  <Users className="h-3.5 w-3.5" />
                  Profile
                </TabsTrigger>
                <TabsTrigger value="members" className="flex-1 gap-1.5 rounded-md text-xs">
                  <UserPlus className="h-3.5 w-3.5" />
                  Members
                  {allMembers.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 h-4 min-w-[16px] rounded-full bg-primary/10 px-1 text-[10px] text-primary"
                    >
                      {allMembers.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── Profile Tab ── */}
            <TabsContent value="profile" className="mt-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-5 px-5 py-5">
                  {/* Group avatar */}
                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        "group relative h-24 w-24 overflow-hidden rounded-full bg-muted/50 transition-colors",
                        isGroupAdmin && "cursor-pointer hover:bg-muted"
                      )}
                      onClick={() => isGroupAdmin && fileInputRef.current?.click()}
                      disabled={!isGroupAdmin || profileLoading}
                    >
                      {profileLoading ? (
                        <div className="flex h-full w-full items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : profilePreview ? (
                        <img
                          src={profilePreview}
                          alt={talkName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserAvatar name={talkName} size="lg" className="h-24 w-24 text-2xl" />
                      )}
                      {isGroupAdmin && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60 opacity-0 transition-opacity group-hover:opacity-100">
                          <Camera className="h-6 w-6 text-foreground" />
                        </div>
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png"
                      className="hidden"
                      onChange={handleImageChange}
                    />
                    {isGroupAdmin && (
                      <span className="text-[11px] text-muted-foreground/60">
                        Click to change photo
                      </span>
                    )}
                  </div>

                  {/* Group name */}
                  {isGroupAdmin ? (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Group Name
                      </label>
                      <input
                        value={groupNameInput}
                        onChange={(e) => setGroupNameInput(e.target.value)}
                        className="flex h-10 w-full rounded-lg border-0 bg-muted/50 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/30"
                      />
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-base font-semibold text-foreground">
                        {talkName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {allMembers.length} participants
                      </p>
                    </div>
                  )}

                  {/* Save button */}
                  {isGroupAdmin && (
                    <Button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="h-9 rounded-lg bg-gradient-to-r from-[var(--chat-gradient-from)] to-[var(--chat-gradient-to)] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  )}

                  {/* Existing members section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/60">
                        Members
                      </span>
                      <span className="text-[10.5px] text-muted-foreground/40">
                        {allMembers.length}
                      </span>
                    </div>

                    {/* Member search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                      <input
                        placeholder="Search members..."
                        value={memberSearch}
                        onChange={(e) => handleMemberSearch(e.target.value)}
                        className="flex h-8 w-full rounded-lg border-0 bg-muted/50 pl-9 pr-8 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/30"
                      />
                      {memberSearch && (
                        <button
                          type="button"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => handleMemberSearch("")}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <MemberList
                      members={filteredMembers}
                      isGroupAdmin={isGroupAdmin}
                      currentUserId={chatuserId}
                      onRemove={handleRemoveMember}
                      onToggleAdmin={handleToggleAdmin}
                    />
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* ── Members (Add) Tab ── */}
            <TabsContent value="members" className="mt-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-4 px-5 py-5">
                  {isGroupAdmin && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/60">
                          Add Members
                        </span>
                      </div>

                      {/* Add member search */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                        <input
                          placeholder="Search users to add..."
                          value={addSearch}
                          onChange={(e) => handleAddSearch(e.target.value)}
                          className="flex h-8 w-full rounded-lg border-0 bg-muted/50 pl-9 pr-8 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/30"
                        />
                        {addSearch && (
                          <button
                            type="button"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                            onClick={() => handleAddSearch("")}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Addable member list */}
                      {filteredAddable.length > 0 ? (
                        <div className="space-y-0.5">
                          {filteredAddable.map((user) => (
                            <div
                              key={user.chatuserId}
                              className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60"
                            >
                              <UserAvatar
                                src={user.profile}
                                name={user.name}
                                size="default"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="truncate text-[13px] font-medium text-foreground">
                                  {user.name}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-lg px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10 hover:text-primary"
                                onClick={() => handleAddMember(user.chatuserId)}
                              >
                                + Add
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-12 text-center text-sm text-muted-foreground/60">
                          No users available to add
                        </p>
                      )}
                    </>
                  )}

                  {!isGroupAdmin && (
                    <div className="space-y-3">
                      <span className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/60">
                        Members ({allMembers.length})
                      </span>
                      <MemberList
                        members={allMembers}
                        isGroupAdmin={false}
                        currentUserId={chatuserId}
                        onRemove={() => {}}
                        onToggleAdmin={() => {}}
                      />
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Confirmation dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) =>
          setConfirmState((prev) => ({ ...prev, open }))
        }
        title={confirmState.title}
        description={confirmState.description}
        confirmText={confirmState.confirmText}
        onConfirm={executeConfirm}
      />
    </>
  );
}
