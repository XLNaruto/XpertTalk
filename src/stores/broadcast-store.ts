/**
 * Broadcast lists store.
 *
 * Holds the broadcast surface's navigation, the cached lists and history, and
 * the tracker for sends that answered `PENDING`. Socket frames only move a
 * progress bar — the final state of a tracked send always comes from
 * `GET /chat/broadcast/detail`, fetched on `broadcastComplete` or when frames
 * stop arriving.
 */
import { create } from "zustand";
import { toast } from "sonner";
import {
  fetchBroadcastHistory,
  fetchBroadcastLists,
  fetchBroadcastReport,
  outcomeHeadline,
  outcomeNote,
  type BroadcastCounts,
  type BroadcastListSummary,
  type BroadcastProgressFrame,
  type BroadcastStatus,
  type HistoryRow,
  type SendResult,
} from "@/lib/broadcast-api";

export type BroadcastView =
  | { kind: "list"; broadcastlistId: string }
  | { kind: "report"; broadcastId: string };

export type BroadcastTab = "lists" | "history";

/** A send the user is watching finish. */
export interface TrackedSend extends BroadcastCounts {
  broadcastId: string;
  broadcastlistId: string;
  listName: string;
  status: BroadcastStatus;
}

const PAGE = 50;
/** No frame for this long → ask the server instead of waiting. */
const FRAME_WATCHDOG_MS = 10_000;
/** While the server still says PENDING, re-ask this often. */
const PENDING_POLL_MS = 3_000;
/** A finished card lingers this long before it clears itself. */
const FINISHED_LINGER_MS = 8_000;

interface BroadcastStore {
  isOpen: boolean;
  tab: BroadcastTab;
  /** Screens pushed over the tabbed home — the last one is showing. */
  stack: BroadcastView[];

  lists: BroadcastListSummary[];
  listsLoading: boolean;
  listsLoaded: boolean;
  listsError: string | null;
  listsHasMore: boolean;

  history: HistoryRow[];
  historyLoading: boolean;
  historyLoaded: boolean;
  historyError: string | null;
  historyHasMore: boolean;

  tracked: Record<string, TrackedSend>;

  /** The list open as a chat in the main area, if any. */
  activeListId: string | null;
  /** Bumped whenever a send settles — open views re-read their history. */
  historyVersion: number;

  open: () => void;
  close: () => void;
  setTab: (tab: BroadcastTab) => void;
  push: (view: BroadcastView) => void;
  pop: () => void;
  openReport: (broadcastId: string) => void;

  refreshLists: () => Promise<void>;
  loadMoreLists: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;

  /** Patch a row locally — rename, member count — without a refetch. */
  patchList: (id: string, patch: Partial<BroadcastListSummary>) => void;
  /** Drop a list that was deleted, or that the server says is gone (404). */
  removeList: (id: string) => void;
  upsertList: (list: BroadcastListSummary) => void;

  /** Open a list as a chat in the main area (closes the sheet). */
  openListChat: (broadcastlistId: string) => void;
  closeListChat: () => void;

  /** Called with a `PENDING` send result — starts watching it. */
  trackPending: (result: SendResult) => void;
  /** `broadcastProgress` / `broadcastComplete` from the `/contact` socket. */
  applyFrame: (frame: BroadcastProgressFrame, complete: boolean) => void;
  dismissTracked: (broadcastId: string) => void;
  /** A send finished (directly, or via the tracker) — refresh what shows it. */
  afterSend: () => void;
}

// Timers live outside the store: they're not state anyone renders.
const watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Set<string>();

function clearTimer(id: string) {
  const t = watchdogs.get(id);
  if (t) clearTimeout(t);
  watchdogs.delete(id);
}

export const useBroadcastStore = create<BroadcastStore>((set, get) => {
  const armWatchdog = (id: string, ms = FRAME_WATCHDOG_MS) => {
    clearTimer(id);
    watchdogs.set(
      id,
      setTimeout(() => reconcile(id), ms)
    );
  };

  /** Ask the server for the authoritative state of a tracked send. */
  const reconcile = async (id: string) => {
    clearTimer(id);
    if (!get().tracked[id] || inflight.has(id)) return;
    inflight.add(id);
    const result = await fetchBroadcastReport({ broadcastId: id, limit: 1 });
    inflight.delete(id);

    const current = get().tracked[id];
    if (!current) return;

    if (!result.ok) {
      if (result.kind === "rejected" && result.status === 404) {
        get().dismissTracked(id);
        return;
      }
      // Transport fault — keep trying, a little slower.
      armWatchdog(id, PENDING_POLL_MS * 2);
      return;
    }

    const b = result.data.broadcast;
    const next: TrackedSend = {
      ...current,
      recipientCount: b.recipientCount,
      sentCount: b.sentCount,
      skippedCount: b.skippedCount,
      failedCount: b.failedCount,
      status: b.status,
    };
    set((s) => ({ tracked: { ...s.tracked, [id]: next } }));

    if (b.status === "PENDING") {
      armWatchdog(id, PENDING_POLL_MS);
      return;
    }
    finish(next);
  };

  const finish = (t: TrackedSend) => {
    clearTimer(t.broadcastId);
    const headline = outcomeHeadline(t);
    const note = outcomeNote(t);
    const description = [t.listName, note].filter(Boolean).join(" · ");
    const action = {
      label: "View report",
      onClick: () => get().openReport(t.broadcastId),
    };
    if (t.status === "FAILED") toast.error(headline, { description, action });
    else toast.success(headline, { description, action });

    get().afterSend();
    setTimeout(() => get().dismissTracked(t.broadcastId), FINISHED_LINGER_MS);
  };

  return {
    isOpen: false,
    tab: "lists",
    stack: [],

    lists: [],
    listsLoading: false,
    listsLoaded: false,
    listsError: null,
    listsHasMore: false,

    history: [],
    historyLoading: false,
    historyLoaded: false,
    historyError: null,
    historyHasMore: false,

    tracked: {},
    activeListId: null,
    historyVersion: 0,

    open: () => {
      set({ isOpen: true });
      get().refreshLists();
      if (get().tab === "history") get().refreshHistory();
    },
    close: () => set({ isOpen: false, stack: [] }),
    setTab: (tab) => {
      set({ tab });
      if (tab === "history") get().refreshHistory();
    },
    push: (view) => set((s) => ({ stack: [...s.stack, view] })),
    pop: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
    openReport: (broadcastId) => {
      const { isOpen } = get();
      set((s) => ({
        isOpen: true,
        stack: [...(isOpen ? s.stack : []), { kind: "report", broadcastId }],
      }));
      if (!isOpen) get().refreshLists();
    },

    refreshLists: async () => {
      set({ listsLoading: true });
      const result = await fetchBroadcastLists(PAGE, 0);
      if (result.ok) {
        set({
          lists: result.data.list,
          listsHasMore: result.data.pagination.hasMore,
          listsLoading: false,
          listsLoaded: true,
          listsError: null,
        });
        return;
      }
      set({ listsLoading: false, listsLoaded: true, listsError: result.message });
    },

    loadMoreLists: async () => {
      const { listsLoading, listsHasMore, lists } = get();
      if (listsLoading || !listsHasMore) return;
      set({ listsLoading: true });
      const result = await fetchBroadcastLists(PAGE, lists.length);
      if (result.ok) {
        const seen = new Set(get().lists.map((l) => l.broadcastlistId));
        set((s) => ({
          lists: [
            ...s.lists,
            ...result.data.list.filter((l) => !seen.has(l.broadcastlistId)),
          ],
          listsHasMore: result.data.pagination.hasMore,
          listsLoading: false,
        }));
        return;
      }
      set({ listsLoading: false });
      toast.error(result.message);
    },

    refreshHistory: async () => {
      set({ historyLoading: true });
      const result = await fetchBroadcastHistory({ limit: PAGE, offset: 0 });
      if (result.ok) {
        set({
          history: result.data.list,
          historyHasMore: result.data.pagination.hasMore,
          historyLoading: false,
          historyLoaded: true,
          historyError: null,
        });
        return;
      }
      set({ historyLoading: false, historyLoaded: true, historyError: result.message });
    },

    loadMoreHistory: async () => {
      const { historyLoading, historyHasMore, history } = get();
      if (historyLoading || !historyHasMore) return;
      set({ historyLoading: true });
      const result = await fetchBroadcastHistory({ limit: PAGE, offset: history.length });
      if (result.ok) {
        const seen = new Set(get().history.map((h) => h.broadcastId));
        set((s) => ({
          history: [
            ...s.history,
            ...result.data.list.filter((h) => !seen.has(h.broadcastId)),
          ],
          historyHasMore: result.data.pagination.hasMore,
          historyLoading: false,
        }));
        return;
      }
      set({ historyLoading: false });
      toast.error(result.message);
    },

    patchList: (id, patch) =>
      set((s) => ({
        lists: s.lists.map((l) => (l.broadcastlistId === id ? { ...l, ...patch } : l)),
      })),

    removeList: (id) =>
      set((s) => ({
        lists: s.lists.filter((l) => l.broadcastlistId !== id),
        // Anything open on that list goes too — it would only 404.
        stack: s.stack.filter((v) => !(v.kind === "list" && v.broadcastlistId === id)),
        activeListId: s.activeListId === id ? null : s.activeListId,
        history: s.history.map((h) =>
          h.broadcastlistId === id ? { ...h, listDeleted: true } : h
        ),
      })),

    upsertList: (list) =>
      set((s) => {
        const exists = s.lists.some((l) => l.broadcastlistId === list.broadcastlistId);
        return {
          lists: exists
            ? s.lists.map((l) => (l.broadcastlistId === list.broadcastlistId ? list : l))
            : [list, ...s.lists],
        };
      }),

    openListChat: (broadcastlistId) => {
      set({ activeListId: broadcastlistId, isOpen: false, stack: [] });
      if (!get().listsLoaded) get().refreshLists();
    },
    closeListChat: () => set({ activeListId: null }),

    trackPending: (result) => {
      const t: TrackedSend = {
        broadcastId: result.broadcastId,
        broadcastlistId: result.broadcastlistId,
        listName: result.listName,
        recipientCount: result.recipientCount,
        sentCount: result.sentCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
        status: "PENDING",
      };
      set((s) => ({ tracked: { ...s.tracked, [t.broadcastId]: t } }));
      armWatchdog(t.broadcastId);
    },

    applyFrame: (frame, complete) => {
      const id = frame?.broadcastId;
      const current = id ? get().tracked[id] : undefined;
      // Only sends this tab is watching. A finished one ignores late frames.
      if (!current || current.status !== "PENDING") return;
      set((s) => ({
        tracked: {
          ...s.tracked,
          [id]: {
            ...current,
            recipientCount: frame.recipientCount ?? current.recipientCount,
            sentCount: frame.sentCount ?? current.sentCount,
            skippedCount: frame.skippedCount ?? current.skippedCount,
            failedCount: frame.failedCount ?? current.failedCount,
            // The bar keeps saying PENDING until the detail fetch confirms.
            status: "PENDING",
          },
        },
      }));
      if (complete) reconcile(id);
      else armWatchdog(id);
    },

    dismissTracked: (broadcastId) => {
      clearTimer(broadcastId);
      set((s) => {
        if (!s.tracked[broadcastId]) return s;
        const next = { ...s.tracked };
        delete next[broadcastId];
        return { tracked: next };
      });
    },

    afterSend: () => {
      set((s) => ({ historyVersion: s.historyVersion + 1 }));
      get().refreshLists();
      if (get().historyLoaded) get().refreshHistory();
    },
  };
});
