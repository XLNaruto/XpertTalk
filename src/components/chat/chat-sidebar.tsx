import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppLogo } from "@/components/shared/app-logo";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  Check,
  CheckCheck,
  ChevronDown,
  LogOut,
  MessageSquare,
  Moon,
  Palette,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Collapsible } from "radix-ui";
import { toast } from "sonner";

import { useAuth } from "@/providers/auth-provider";
import { useChatStore } from "@/stores/chat-store";
import { useUserListStore } from "@/stores/user-list-store";
import { useUIStore } from "@/stores/ui-store";
import { useContactSocket } from "@/hooks/use-socket";
import { apiHeader, getData, postData } from "@/lib/api-helper";
import { decrypt, encryptUrlData, getEncodedCookie } from "@/lib/encryption";
import { clearCookies } from "@/lib/cookie";
import logger from "@/lib/logger";
import { getAllDraftsFromDB } from "@/db/indexed-db";

import { UserAvatar } from "@/components/shared/user-avatar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChatListItem } from "@/components/chat/chat-list-item";
import { CreateGroupDialog } from "@/components/group/create-group-dialog";
import { SidebarSkeleton } from "@/components/chat/sidebar-skeleton";
import { UserProfileDialog } from "@/components/modals/user-profile-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const userStage = import.meta.env.VITE_APP_USER || "employee"; // kept for admin check in canDelete

// ── Collapsible chat section ────────────────────────────────────────
function ChatSection({
  title,
  items,
  defaultOpen = true,
  talkIdState,
  chatuserId,
  userDrafts,
  onSelect,
  onPin,
  onDelete,
}: {
  title: string;
  items: any[];
  defaultOpen?: boolean;
  talkIdState: string;
  chatuserId: string;
  userDrafts: { talkId: string; message: string; attachments?: any[] }[];
  onSelect: (data: any) => void;
  onPin: (talkId: string, isPinned: boolean) => void;
  onDelete: (talkId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const totalUnread = useMemo(
    () => items.reduce((sum, i) => sum + (i.unreadCount || 0), 0),
    [items],
  );

  const previewItems = useMemo(() => items.slice(0, 4), [items]);
  const remainingCount = items.length - previewItems.length;

  if (items.length === 0) return null;

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="px-3">
        <Collapsible.Trigger asChild>
          <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/60 transition-colors hover:bg-primary/5 hover:text-muted-foreground">
            <ChevronDown
              className={cn(
                "h-3 w-3 shrink-0 transition-transform duration-200",
                !open && "-rotate-90",
              )}
            />
            <span className="shrink-0">{title}</span>
            <span className="text-[10px] font-medium text-muted-foreground/40">
              {items.length}
            </span>

            <span className="flex-1" />

            {!open && totalUnread > 0 && (
              <Badge className="glow-badge h-[18px] min-w-[18px] rounded-full bg-primary px-1.5 text-[10px] font-bold leading-none text-primary-foreground">
                {totalUnread > 99 ? "99+" : totalUnread}
              </Badge>
            )}
          </button>
        </Collapsible.Trigger>

        {/* Collapsed: show avatar previews */}
        {!open && (
          <div className="flex items-center gap-1 px-2 pb-2 pt-0.5">
            <div className="flex -space-x-2">
              {previewItems.map((item: any) => {
                const isPrivate = item.talkType === "PRIVATE";
                const name = isPrivate ? item.receiverName : item.talkName;
                const profile = isPrivate
                  ? item.receiverProfile
                  : item.talkProfile;
                return (
                  <div
                    key={item.talkId}
                    className="rounded-full ring-2 ring-background"
                  >
                    <UserAvatar src={profile} name={name} size="sm" />
                  </div>
                );
              })}
            </div>
            {remainingCount > 0 && (
              <span className="ml-1 text-[11px] text-muted-foreground/50">
                +{remainingCount}
              </span>
            )}
          </div>
        )}
      </div>

      <Collapsible.Content>
        <div className="space-y-0.5 px-2 py-1">
          {items.map((data: any) => {
            const draft = userDrafts.find((d) => d.talkId === data.talkId);
            const canDelete =
              data.talkType === "GROUP" &&
              (userStage === "admin" || data.isGroupAdmin);

            return (
              <ChatListItem
                key={data.talkId}
                data={data}
                isActive={!!data.talkId && data.talkId === talkIdState}
                chatuserId={chatuserId}
                draft={draft}
                onSelect={onSelect}
                onPin={onPin}
                onDelete={canDelete ? onDelete : undefined}
              />
            );
          })}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

// ── Accent color presets ─────────────────────────────────────────────
// const ACCENT_COLORS = [
//   { name: "default", light: "#7c6ce7", dark: "#a78bfa" },
//   { name: "midnight", light: "#4338ca", dark: "#818cf8" },
//   // { name: "red", light: "#ef4444", dark: "#f87171" },
//   // { name: "orange", light: "#f97316", dark: "#fb923c" },
//   // { name: "yellow", light: "#eab308", dark: "#facc15" },
//   // { name: "green", light: "#22c55e", dark: "#4ade80" },
//   { name: "teal", light: "#14b8a6", dark: "#2dd4bf" },
//   { name: "blue", light: "#3b82f6", dark: "#60a5fa" },
//   { name: "pink", light: "#ec4899", dark: "#f472b6" },
//   { name: "ocean", light: "#0ea5e9", dark: "#38bdf8" },
//   // { name: "gunmetal", light: "#2a3439", dark: "#4a5c64" },
//   { name: "emerald", light: "#10b981", dark: "#34d399" },
//   { name: "black", light: "#000000", dark: "#1a1a1a" },
//   { name: "rose", light: "#f43f5e", dark: "#fb7185" },
//   { name: "coral", light: "#ef6c4a", dark: "#f8917a" },
//   { name: "burgundy", light: "#9f1239", dark: "#e11d48" },
//   { name: "bronze", light: "#92400e", dark: "#d97706" },
// ];

// const ACCENT_COLORS = [
//   { name: "default", light: "#7c6ce7", dark: "#a78bfa" },
//   { name: "black", light: "#000000", dark: "#1a1a1a" },
//   { name: "ocean", light: "#0ea5e9", dark: "#38bdf8" },
//   { name: "gunmetal", light: "#2a3439", dark: "#4a5c64" },
//   { name: "emerald", light: "#10b981", dark: "#34d399" },
//   { name: "rose", light: "#f43f5e", dark: "#fb7185" },
//   { name: "coral", light: "#ef6c4a", dark: "#f8917a" },
//   { name: "pink", light: "#ec4899", dark: "#f472b6" },
//   { name: "midnight", light: "#4338ca", dark: "#818cf8" },
//   { name: "burgundy", light: "#9f1239", dark: "#e11d48" },
//   { name: "bronze", light: "#92400e", dark: "#d97706" },
// ];

const ACCENT_COLORS = [
  { name: "default", themeName: "Default", light: "#7c6ce7", dark: "#a78bfa" },
  {
    name: "midnight",
    themeName: "Midnight",
    light: "#4338ca",
    dark: "#818cf8",
  },
  { name: "teal", themeName: "Lagoon", light: "#14b8a6", dark: "#2dd4bf" },
  { name: "blue", themeName: "Horizon", light: "#3b82f6", dark: "#60a5fa" },
  { name: "pink", themeName: "Blossom", light: "#ec4899", dark: "#f472b6" },
  { name: "ocean", themeName: "Arctic", light: "#0ea5e9", dark: "#38bdf8" },
  { name: "emerald", themeName: "Forest", light: "#10b981", dark: "#34d399" },
  { name: "black", themeName: "Shadow", light: "#000000", dark: "#1a1a1a" },
  { name: "rose", themeName: "Passion", light: "#f43f5e", dark: "#fb7185" },
  { name: "coral", themeName: "Sunset", light: "#ef6c4a", dark: "#f8917a" },
  { name: "burgundy", themeName: "Velvet", light: "#9f1239", dark: "#e11d48" },
  { name: "bronze", themeName: "Autumn", light: "#92400e", dark: "#d97706" },
];

const ACCENT_CLASS_PREFIX = "accent-";
const ACCENT_STORAGE_KEY = "xt-accent-color";

function getStoredAccent(): string {
  try {
    return localStorage.getItem(ACCENT_STORAGE_KEY) || "default";
  } catch {
    return "default";
  }
}

function applyAccentClass(name: string) {
  const root = document.documentElement;
  root.classList.forEach((cls) => {
    if (cls.startsWith(ACCENT_CLASS_PREFIX)) root.classList.remove(cls);
  });
  if (name !== "default") {
    root.classList.add(`${ACCENT_CLASS_PREFIX}${name}`);
  }
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, name);
  } catch {
    /* noop */
  }
}

// ── Main Sidebar ────────────────────────────────────────────────────
export function ChatSidebar() {
  const navigate = useNavigate();
  const { currentUser, logout: authLogout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [accentColor, setAccentColor] = useState(getStoredAccent);

  const WS_URL = useChatStore((s) => s.WS_URL);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const talkIdState = useChatStore((s) => s.activeChat.talkId);

  const userList = useUserListStore((s) => s.userList);
  const setUserList = useUserListStore((s) => s.setUserList);
  const getUserList = useUserListStore((s) => s.getUserList);
  const applyPresence = useUserListStore((s) => s.applyPresence);
  const isUserListLoading = useUserListStore((s) => s.isLoading);

  const closeSearchOnMsg = useUIStore((s) => s.closeSearchOnMsg);
  const setCloseSearchOnMsg = useUIStore((s) => s.setCloseSearchOnMsg);

  // Local state
  const [isSearch, setIsSearch] = useState(false);
  const isSearchRef = useRef(false);
  isSearchRef.current = isSearch;
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchHighlightIndex, setSearchHighlightIndex] = useState(-1);
  const searchListRef = useRef<HTMLDivElement>(null);
  const [userDrafts, setUserDrafts] = useState<
    { talkId: string; message: string; attachments?: any[] }[]
  >([]);
  const [profileData, setProfileData] = useState<any>({});
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    talkId: string;
  }>({ open: false, talkId: "" });
  const [chatFilter, setChatFilter] = useState<"all" | "group" | "unread">(
    "all",
  );
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [colorThemeOpen, setColorThemeOpen] = useState(false);
  const [pendingAccent, setPendingAccent] = useState<string | null>(null);

  const xtoken = getEncodedCookie("token") || "";
  const chatuserId = getEncodedCookie("chatuserId") || "";

  // ── Contact Socket.IO ──
  useContactSocket({
    baseUrl: WS_URL,
    token: xtoken || null,
    onTalkUpdated: (newMessage: any) => {
      logger.debug("Contact socket talkUpdated:", newMessage);
      updateUserList(newMessage);
    },
  });

  // Always read the currently-open chat so socket updates use the latest value
  const activeTalkIdRef = useRef(talkIdState);
  activeTalkIdRef.current = talkIdState;

  const updateUserList = useCallback(
    (newMessage: any) => {
      setUserList((prev: any[]) => {
        const talkId = newMessage.talkId;
        const isActiveChat = talkId === activeTalkIdRef.current;
        // For the chat the user is currently viewing, MessageList owns the unread
        // count (it ticks it down as the viewport marks messages read). Don't let
        // the server's talkUpdated value clobber that — preserve the local count.
        const prevEntry = prev.find((u) => u.talkId === talkId);
        const entry = isActiveChat
          ? { ...newMessage, unreadCount: prevEntry?.unreadCount ?? 0 }
          : newMessage;
        const newSendAt = newMessage?.lastMessage?.sendAt
          ? new Date(newMessage.lastMessage.sendAt).getTime()
          : newMessage?.created
            ? new Date(newMessage.created).getTime()
            : 0;

        const updated = [...prev];
        const idx = updated.findIndex((u) => u.talkId === talkId);

        if (idx !== -1) {
          const existing = updated[idx];
          const existingSendAt = existing?.lastMessage?.sendAt
            ? new Date(existing.lastMessage.sendAt).getTime()
            : existing?.created
              ? new Date(existing.created).getTime()
              : 0;
          if (existingSendAt === newSendAt) {
            updated[idx] = entry;
          } else {
            updated.splice(idx, 1);
            updated.push(entry);
          }
        } else {
          updated.push(entry);
        }

        return sortChatList(updated);
      });
    },
    [setUserList],
  );

  const sortChatList = (list: any[]) => {
    const getSortTime = (item: any) =>
      item?.lastMessage?.sendAt
        ? new Date(item.lastMessage.sendAt).getTime()
        : new Date(item.created).getTime();

    const pinned = list
      .filter((i) => i.isPinned)
      .sort((a, b) => getSortTime(b) - getSortTime(a));
    const unpinned = list
      .filter((i) => !i.isPinned)
      .sort((a, b) => getSortTime(b) - getSortTime(a));
    return [...pinned, ...unpinned];
  };

  // ── Profile ──
  const fetchProfile = async () => {
    const response: any = await getData(
      "auth/profile",
      {},
      apiHeader(false, 0),
    );
    if (
      String(response?.status) === "200" &&
      String(response?.data.status) === "200"
    ) {
      setProfileData(response.data.data);
    }
  };

  useEffect(() => {
    if (chatuserId) fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatuserId]);

  // ── Initial user list fetch ──
  useEffect(() => {
    getUserList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Presence polling (solo chats, every 30s) ──
  // Collect every PRIVATE chat's receiver chatuserId and poll their online status.
  const soloChatuserIds = useMemo(
    () =>
      Array.from(
        new Set(
          userList
            .filter((u: any) => u.talkType === "PRIVATE" && u.receiverId)
            .map((u: any) => u.receiverId),
        ),
      ),
    [userList],
  );
  // Stable key so the interval only resets when the set of ids actually changes,
  // not on every unrelated userList update (new message, unread tick, etc.).
  const soloIdsKey = soloChatuserIds.join(",");
  const soloIdsRef = useRef<any[]>(soloChatuserIds);
  soloIdsRef.current = soloChatuserIds;

  useEffect(() => {
    if (soloIdsRef.current.length === 0) return;

    let cancelled = false;
    const fetchPresence = async () => {
      try {
        const response: any = await postData(
          "chat/talk/presence",
          { chatuserIds: soloIdsRef.current },
          apiHeader(false, 0),
        );
        if (
          !cancelled &&
          String(response?.status) === "200" &&
          String(response?.data.status) === "200"
        ) {
          applyPresence(response.data.data || []);
        }
      } catch (error) {
        logger.error("Presence fetch failed:", error);
      }
    };

    fetchPresence();
    const interval = setInterval(fetchPresence, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloIdsKey, applyPresence]);

  // ── Search ──
  const getSearchUserList = async (search: string = "") => {
    const response: any = await postData(
      "chat/talk/search",
      { term: search },
      apiHeader(false, 0),
    );
    if (
      String(response?.status) === "200" &&
      String(response?.data.status) === "200"
    ) {
      setSearchResults(response.data.data);
      setSearchHighlightIndex(-1);
    }
  };

  useEffect(() => {
    getSearchUserList(searchInput);
  }, [searchInput, talkIdState]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!isSearch || searchResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchHighlightIndex((prev) => {
        const next = prev < searchResults.length - 1 ? prev + 1 : 0;
        scrollSearchItemIntoView(next);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchHighlightIndex((prev) => {
        const next = prev > 0 ? prev - 1 : searchResults.length - 1;
        scrollSearchItemIntoView(next);
        return next;
      });
    } else if (e.key === "Enter" && searchHighlightIndex >= 0) {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
      handleSelect(searchResults[searchHighlightIndex]);
    }
  };

  const scrollSearchItemIntoView = (index: number) => {
    const container = searchListRef.current;
    if (!container) return;
    const items = container.querySelectorAll("[data-search-item]");
    items[index]?.scrollIntoView({ block: "nearest" });
  };

  const closeSearch = () => {
    setIsSearch(false);
    setSearchHighlightIndex(-1);
    setSearchInput("");
    setSearchResults([]);
  };

  useEffect(() => {
    if (closeSearchOnMsg) {
      closeSearch();
      setCloseSearchOnMsg(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSearchOnMsg]);

  // ── Drafts ──
  useEffect(() => {
    const fetchDrafts = async () => {
      try {
        const drafts = await getAllDraftsFromDB();
        const previews = drafts.map((d: any) => {
          const decryptedStr = decrypt(d.message);
          const decryptedBytes = new Uint8Array(
            Array.from(decryptedStr).map((ch: string) => ch.charCodeAt(0)),
          );
          const decryptedMessage = new TextDecoder().decode(decryptedBytes);
          return {
            talkId: d.talkId,
            message: decryptedMessage,
            attachments: d.attachments || [],
          };
        });
        setUserDrafts(previews);
      } catch {
        // IndexedDB may not be available
      }
    };
    fetchDrafts();
  }, [talkIdState, userList]);

  // ── Pin/Unpin ──
  const handlePin = async (talkId: string, isPinned: boolean) => {
    const response: any = await postData(
      "chat/talk/pin",
      { id: talkId, isPinned: !isPinned },
      apiHeader(false, 0),
    );
    if (
      String(response?.status) === "200" &&
      String(response?.data.status) === "200"
    ) {
      if (isSearchRef.current) {
        getSearchUserList(searchInput);
      } else {
        getUserList();
      }
    }
  };

  // ── Delete group ──
  const handleDeleteConfirm = async () => {
    const response: any = await postData(
      "chat/talk/delete/group",
      { id: confirmDelete.talkId },
      apiHeader(false, 0),
    );
    if (
      String(response?.status) === "200" &&
      String(response?.data.status) === "200"
    ) {
      toast.success("Group deleted");
      if (isSearchRef.current) {
        getSearchUserList(searchInput);
      } else {
        getUserList();
      }
    }
  };

  const handleDelete = useCallback(
    (talkId: string) => setConfirmDelete({ open: true, talkId }),
    [],
  );

  // ── Select chat ──
  const handleSelect = useCallback(
    (data: any) => {
      setIsSearch(false);
      setSearchInput("");
      setSearchResults([]);

      setActiveChat({
        talkId: data.talkId || "",
        receiverId: data.receiverId || "",
        receiverName: data.receiverName || "",
        receiverType: data.receiverType || "",
        receiverProfile: data.receiverProfile || "",
        talkType: data.talkType || "",
        talkName: data.talkName || "",
        talkProfile: data.talkProfile || "",
        isActive: data.isActive || false,
        isGroupAdmin: data.isGroupAdmin || false,
      });
      navigate(
        `/chats/?data=${encryptUrlData({
          talkId: data.talkId || "",
          receiverId: data.receiverId || "",
          receiverName: data.receiverName || "",
          receiverType: data.receiverType || "",
          talkType: data.talkType || "",
          talkName: data.talkName || "",
          isActive: data.isActive || false,
          isGroupAdmin: data.isGroupAdmin || false,
        })}`,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setActiveChat, navigate],
  );

  // ── Logout ──
  const [logoutOpen, setLogoutOpen] = useState(false);
  const handleLogout = async () => {
    try {
      const { messaging } = await import("@/lib/firebase");
      const { getToken } = await import("firebase/messaging");
      const swReady = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (swReady) {
        const token = await getToken(messaging, {
          vapidKey:
            "BFog9fo16WkUfO37C9jJZB8l0TfN2tVxNY-Y3Mry-7SzXSbsAMOHvN4ZONHX2DErzLI8JuU7ijhm9teY7nY9dP8",
          serviceWorkerRegistration: swReady,
        });
        if (token) {
          await postData(
            "auth/fcm/remove",
            { token },
            apiHeader(false, 0),
          );
        }
      }
    } catch (error) {
      logger.error("Error removing FCM token:", error);
    }
    authLogout();
    clearCookies();
    location.reload();
  };

  // ── Computed lists ──
  const filteredList = useMemo(() => {
    if (chatFilter === "group")
      return userList.filter((u: any) => u.talkType === "GROUP");
    if (chatFilter === "unread")
      return userList.filter((u: any) => u.unreadCount > 0);
    return userList;
  }, [userList, chatFilter]);

  const pinnedItems = useMemo(
    () => filteredList.filter((u: any) => u.isPinned),
    [filteredList],
  );
  const recentItems = useMemo(
    () => filteredList.filter((u: any) => !u.isPinned),
    [filteredList],
  );

  // ── PWA app badge — show unread count on desktop app icon ──
  // const globalUnreadCount = useMemo(
  //   () => userList.reduce((sum: number, u: any) => sum + (u.unreadCount || 0), 0),
  //   [userList],
  // );

  // useEffect(() => {
  //   // App icon badge (PWA installed on desktop/mobile)
  //   if ("setAppBadge" in navigator) {
  //     if (globalUnreadCount > 0) {
  //       navigator.setAppBadge(globalUnreadCount).catch(() => {});
  //     } else {
  //       navigator.clearAppBadge?.().catch(() => {});
  //     }
  //   }
  //   // Title badge (browser tab & PWA window title)
  //   document.title = globalUnreadCount > 0
  //     ? `(${globalUnreadCount})`
  //     : "XpertTalk";
  // }, [globalUnreadCount]);

  const profileName = profileData?.firstName
    ? `${profileData.firstName} ${profileData.lastName || ""}`
    : currentUser?.first_name || "";

  // Show skeleton while initial load
  if (isUserListLoading && userList.length === 0) {
    return <SidebarSkeleton />;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-r border-border/50 bg-sidebar-background">
      {/* ── Top: Logo + actions ── */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <AppLogo />
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            XpertTalk
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          onClick={() => setCreateGroupOpen(true)}
          title="New group"
        >
          <svg
            fill="currentColor"
            width="24"
            height="24"
            viewBox="0 -64 640 640"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M96 224c35.3 0 64-28.7 64-64s-28.7-64-64-64-64 28.7-64 64 28.7 64 64 64zm448 0c35.3 0 64-28.7 64-64s-28.7-64-64-64-64 28.7-64 64 28.7 64 64 64zm32 32h-64c-17.6 0-33.5 7.1-45.1 18.6 40.3 22.1 68.9 62 75.1 109.4h66c17.7 0 32-14.3 32-32v-32c0-35.3-28.7-64-64-64zm-256 0c61.9 0 112-50.1 112-112S381.9 32 320 32 208 82.1 208 144s50.1 112 112 112zm76.8 32h-8.3c-20.8 10-43.9 16-68.5 16s-47.6-6-68.5-16h-8.3C179.6 288 128 339.6 128 403.2V432c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48v-28.8c0-63.6-51.6-115.2-115.2-115.2zm-223.7-13.4C161.5 263.1 145.6 256 128 256H64c-35.3 0-64 28.7-64 64v32c0 17.7 14.3 32 32 32h65.9c6.3-47.4 34.9-87.3 75.2-109.4z" />
          </svg>
        </Button>
      </div>

      {/* ── Search ── */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search..."
            className="h-9 rounded-xl border-2 border-border bg-card pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:border-primary/50"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              setIsSearch(true);
              getSearchUserList(searchInput);
            }}
          />
          {isSearch && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              onClick={closeSearch}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Filter tabs ── */}
      {!isSearch && (
        <div className="flex gap-2 px-4 pb-2.5">
          {(["all", "group", "unread"] as const).map((filter) => {
            const isActive = chatFilter === filter;
            const unreadCount = filter === "unread"
              ? userList.filter((u: any) => u.unreadCount > 0).length
              : 0;
            return (
              <button
                key={filter}
                onClick={() => setChatFilter(filter)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold capitalize transition-all",
                  isActive
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/50 bg-card/60 text-muted-foreground hover:bg-card",
                )}
              >
                {filter}
                {filter === "unread" && unreadCount > 0 && (
                  <span
                    className={cn(
                      "flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted-foreground/20 text-muted-foreground",
                    )}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Chat sections ── */}
      <ScrollArea className="min-h-0 flex-1">
        {isSearch ? (
          <div ref={searchListRef} className="space-y-0.5 px-2 pb-2 pt-1">
            {searchResults.length > 0 ? (
              searchResults.map((data: any, index: number) => (
                <div
                  key={`${data.talkId || ""}-${index}`}
                  data-search-item
                  className={cn(
                    "rounded-lg transition-colors",
                    searchHighlightIndex === index && "bg-primary/10",
                  )}
                  onMouseEnter={() => setSearchHighlightIndex(index)}
                >
                  <ChatListItem
                    data={data}
                    isActive={!!data.talkId && data.talkId === talkIdState}
                    chatuserId={chatuserId}
                    onSelect={handleSelect}
                    onPin={handlePin}
                    onDelete={
                      data.talkType === "GROUP" &&
                      (userStage === "admin" || data.isGroupAdmin)
                        ? handleDelete
                        : undefined
                    }
                  />
                </div>
              ))
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground/60">
                No results found
              </p>
            )}
          </div>
        ) : filteredList.length === 0 ? (
          <div className="flex min-h-[calc(100vh-220px)] flex-col items-center justify-center px-8" style={{ animation: 'fadeUpIn 0.5s ease-out' }}>
            {/* ── Unread empty ── */}
            {chatFilter === "unread" && (
              <>
                <div className="relative mb-6">
                  {/* Glowing ring behind */}
                  <div className="absolute inset-0 rounded-full bg-primary/10" style={{ animation: 'scalePulse 3s ease-in-out infinite' }} />
                  {/* Main circle */}
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
                    <CheckCheck className="h-9 w-9 text-primary" strokeWidth={1.8} />
                  </div>
                  {/* Sparkle accents */}
                  <div className="absolute -right-1 -top-1" style={{ animation: 'scalePulse 2s ease-in-out infinite 0.3s' }}>
                    <Sparkles className="h-4 w-4 text-primary/60" />
                  </div>
                  <div className="absolute -bottom-0.5 -left-1.5" style={{ animation: 'scalePulse 2.5s ease-in-out infinite 0.8s' }}>
                    <Sparkles className="h-3 w-3 text-primary/40" />
                  </div>
                </div>
                <p className="text-[15px] font-bold text-foreground">All caught up!</p>
                <p className="mt-1.5 text-center text-xs leading-relaxed text-muted-foreground/60">
                  No unread messages waiting for you.
                  <br />
                  Relax, you're all set.
                </p>
              </>
            )}

            {/* ── Group empty ── */}
            {chatFilter === "group" && (
              <>
                <div className="relative mb-6">
                  <div className="absolute inset-0 rounded-full bg-primary/10" style={{ animation: 'scalePulse 3s ease-in-out infinite' }} />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5" style={{ animation: 'wiggle 3s ease-in-out infinite' }}>
                    <Users className="h-9 w-9 text-primary" strokeWidth={1.8} />
                  </div>
                </div>
                <p className="text-[15px] font-bold text-foreground">No groups yet</p>
                <p className="mt-1.5 text-center text-xs leading-relaxed text-muted-foreground/60">
                  Create a group to start collaborating
                  <br />
                  with your team.
                </p>
              </>
            )}

            {/* ── All empty ── */}
            {chatFilter === "all" && (
              <>
                <div className="relative mb-6 animate-float">
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
                    <MessageSquare className="h-9 w-9 text-primary" strokeWidth={1.8} />
                  </div>
                  <div className="absolute -right-1 -top-1" style={{ animation: 'scalePulse 2s ease-in-out infinite' }}>
                    <Sparkles className="h-4 w-4 text-primary/60" />
                  </div>
                </div>
                <p className="text-[15px] font-bold text-foreground">No conversations yet</p>
                <p className="mt-1.5 text-center text-xs leading-relaxed text-muted-foreground/60">
                  Start a new chat to begin
                  <br />
                  your first conversation.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-1 pb-2 pt-1">
            {pinnedItems.length > 0 && (
              <ChatSection
                title="Pinned"
                items={pinnedItems}
                defaultOpen={true}
                talkIdState={talkIdState}
                chatuserId={chatuserId}
                userDrafts={userDrafts}
                onSelect={handleSelect}
                onPin={handlePin}
                onDelete={handleDelete}
              />
            )}
            <ChatSection
              title="Recent"
              items={recentItems}
              defaultOpen={true}
              talkIdState={talkIdState}
              chatuserId={chatuserId}
              userDrafts={userDrafts}
              onSelect={handleSelect}
              onPin={handlePin}
              onDelete={handleDelete}
            />
          </div>
        )}
      </ScrollArea>

      {/* ── Bottom: User bar with Settings dropdown ── */}
      <div className="border-t border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <UserAvatar
            src={profileData?.profileUrl || profileData?.profile}
            name={profileName}
            size="default"
            online
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-foreground">
              {profileName}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {currentUser?.email || profileData?.designation || "Online"}
            </p>
          </div>

          {/* Settings dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={8}
              className="w-52 rounded-xl border-border/50 p-1.5"
            >
              {/* Dark Mode toggle row */}
              <div
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-accent"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                <Moon className="h-4 w-4 text-primary" />
                <span className="flex-1 font-medium">Dark Mode</span>
                <Switch
                  checked={theme === "dark"}
                  onCheckedChange={(checked) =>
                    setTheme(checked ? "dark" : "light")
                  }
                  className="scale-[0.8]"
                />
              </div>
              {/* Accent color selector */}
              <div
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors hover:bg-accent"
                onClick={() => setColorThemeOpen(true)}
              >
                <Palette className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-medium">Color Theme</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {/* <span className="text-xs capitalize text-muted-foreground">
                    {accentColor}
                  </span> */}
                  <span
                    className="h-4 w-4 rounded-full ring-2 ring-background"
                    style={{
                      backgroundColor:
                        theme === "dark"
                          ? ACCENT_COLORS.find((c) => c.name === accentColor)
                              ?.dark
                          : ACCENT_COLORS.find((c) => c.name === accentColor)
                              ?.light,
                    }}
                  />
                </div>
              </div>
              {/* <DropdownMenuItem
                onClick={() => setProfileDialogOpen(true)}
                className="gap-2.5 rounded-lg px-2.5 py-2 text-sm"
              >
                <Camera className="h-4 w-4" />
                Change Photo
              </DropdownMenuItem> */}
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                onClick={() => setLogoutOpen(true)}
                className="gap-2.5 rounded-lg px-2.5 py-2 text-sm"
              >
                <LogOut className="h-4 w-4 text-primary" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Logout confirmation */}
      <ConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Logout"
        description="Are you sure you want to logout?"
        confirmText="Logout"
        onConfirm={handleLogout}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDelete.open}
        onOpenChange={(open) => setConfirmDelete((prev) => ({ ...prev, open }))}
        title="Delete Group"
        description="Are you sure you want to delete this group? This action cannot be undone."
        confirmText="Delete"
        onConfirm={handleDeleteConfirm}
      />

      {/* User profile dialog */}
      <UserProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        profileUrl={profileData?.profileUrl || profileData?.profile || ""}
        userName={profileName}
        onProfileChanged={fetchProfile}
      />

      {/* Create group dialog */}
      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        onGroupCreated={(data) => {
          // Select the newly created group
          handleSelect({
            talkId: data.talkId,
            talkType: "GROUP",
            talkName: data.name,
            talkProfile: data.profile,
            receiverId: "",
            receiverName: "",
            receiverType: "",
            receiverProfile: "",
            isActive: false,
            isGroupAdmin: true,
          });
          getUserList();
        }}
      />

      {/* Color Theme Picker Dialog */}
      <Dialog
        open={colorThemeOpen}
        onOpenChange={(open) => {
          setColorThemeOpen(open);
          if (open) setPendingAccent(accentColor);
          else setPendingAccent(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              Color Theme
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {ACCENT_COLORS.map((c) => {
              const selected = (pendingAccent ?? accentColor) === c.name;
              const color = theme === "dark" ? c.dark : c.light;
              return (
                <button
                  key={c.name}
                  onClick={() => setPendingAccent(c.name)}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all",
                    selected
                      ? "ring-2 bg-primary/10"
                      : "hover:bg-muted/60 ring-1 ring-border/40",
                  )}
                  style={
                    selected
                      ? {
                          boxShadow: `inset 0 0 0 0 transparent, 0 0 0 2px ${color}`,
                        }
                      : undefined
                  }
                >
                  <span
                    className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform group-hover:scale-110"
                    style={{ backgroundColor: color }}
                  >
                    {selected && (
                      <Check
                        className="h-3.5 w-3.5 text-white"
                        strokeWidth={3}
                      />
                    )}
                  </span>
                  <span className="text-xs font-medium capitalize text-foreground">
                    {c.themeName}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Preview — wrap in accent+dark class so CSS vars match the pending theme */}
          {(() => {
            const previewName = pendingAccent ?? accentColor;
            const accentClass = `accent-${previewName}`;
            const isDark = theme === "dark";
            return (
              <div
                className={cn(
                  "rounded-xl border border-border/50 p-4",
                  accentClass,
                  isDark && "dark",
                )}
                style={{ backgroundColor: "var(--color-background)" }}
              >
                <p
                  className="mb-3 text-[10px] font-semibold uppercase tracking-widest"
                  style={{
                    color: "var(--color-muted-foreground)",
                    opacity: 0.6,
                  }}
                >
                  Preview
                </p>
                <div className="flex flex-col gap-2">
                  <div
                    className="bubble-recv self-start rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm"
                    style={{ border: "1px solid var(--bubble-recv-shadow1)" }}
                  >
                    Hey, how are you doing?
                  </div>
                  <div className="bubble-sent self-end rounded-2xl rounded-br-sm px-3.5 py-2 text-sm">
                    I&apos;m great, thanks! 🎉
                  </div>
                </div>
              </div>
            );
          })()}

          <Button
            className="w-full rounded-xl font-semibold"
            disabled={!pendingAccent || pendingAccent === accentColor}
            onClick={() => {
              if (pendingAccent && pendingAccent !== accentColor) {
                setAccentColor(pendingAccent);
                applyAccentClass(pendingAccent);
              }
              setColorThemeOpen(false);
              setPendingAccent(null);
            }}
          >
            Apply Theme
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
