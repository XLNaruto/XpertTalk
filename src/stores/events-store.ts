/**
 * Events store.
 *
 * There are no sockets for events — the list is refreshed on open, on user
 * refresh, after every successful write, and whenever an event push arrives.
 */
import { create } from "zustand";
import {
  addParticipants,
  cancelEvent,
  createEvent,
  fetchEventDetail,
  fetchEventList,
  removeParticipant,
  updateEvent,
  type ApiResult,
  type CreateEventInput,
  type EventRecord,
  type ParticipantInput,
  type UpdateEventInput,
} from "@/lib/events-api";

interface EventsStore {
  events: EventRecord[];
  isLoading: boolean;
  /** Set only for retryable transport faults — rejections are shown inline. */
  transportError: string | null;
  hasLoadedOnce: boolean;

  /** The events surface itself. */
  isOpen: boolean;
  /** The event whose details are open, if any. */
  activeEventId: string | null;
  detail: EventRecord | null;
  detailLoading: boolean;
  detailError: string | null;

  openEvents: () => void;
  closeEvents: () => void;
  /** Open the surface on one event — used by list rows and by push taps. */
  openEventDetail: (id: string) => void;
  closeDetail: () => void;

  refreshList: () => Promise<void>;
  /** Always re-fetches: a reminder can be hours old and the event may have moved. */
  loadDetail: (id: string) => Promise<ApiResult<EventRecord>>;

  create: (input: CreateEventInput) => Promise<ApiResult<EventRecord>>;
  update: (input: UpdateEventInput) => Promise<ApiResult<EventRecord>>;
  cancel: (id: string, clientEventId?: string) => Promise<ApiResult<EventRecord>>;
  addPeople: (id: string, people: ParticipantInput[]) => Promise<ApiResult<EventRecord>>;
  removePerson: (
    id: string,
    chatuserId: string,
    userType?: string
  ) => Promise<ApiResult<EventRecord>>;
}

export const useEventsStore = create<EventsStore>((set, get) => ({
  events: [],
  isLoading: false,
  transportError: null,
  hasLoadedOnce: false,

  isOpen: false,
  activeEventId: null,
  detail: null,
  detailLoading: false,
  detailError: null,

  openEvents: () => {
    set({ isOpen: true });
    get().refreshList();
  },
  closeEvents: () =>
    set({ isOpen: false, activeEventId: null, detail: null, detailError: null }),

  openEventDetail: (id) => {
    set({ isOpen: true, activeEventId: id });
    get().loadDetail(id);
    // The row that was tapped may be stale too (cancelled since the push).
    get().refreshList();
  },
  closeDetail: () => set({ activeEventId: null, detail: null, detailError: null }),

  refreshList: async () => {
    set({ isLoading: true });
    const result = await fetchEventList();
    if (result.ok) {
      set({
        events: result.data,
        isLoading: false,
        transportError: null,
        hasLoadedOnce: true,
      });
      return;
    }
    set({
      isLoading: false,
      hasLoadedOnce: true,
      // A rejection here is permanent; a transport fault gets a Retry button.
      transportError: result.message,
    });
  },

  loadDetail: async (id) => {
    set({ detailLoading: true, detailError: null });
    const result = await fetchEventDetail(id);
    if (result.ok) {
      set({ detail: result.data, detailLoading: false });
      mergeIntoList(set, get, result.data);
      return result;
    }
    // 404 — gone, or not visible to this caller. Drop the row and go back.
    if (result.kind === "rejected" && result.status === 404) {
      set((state) => ({
        events: state.events.filter((e) => e.id !== id),
        activeEventId: null,
        detail: null,
        detailLoading: false,
        detailError: result.message,
      }));
      return result;
    }
    set({ detailLoading: false, detailError: result.message });
    return result;
  },

  create: async (input) => {
    const result = await createEvent(input);
    if (result.ok) {
      mergeIntoList(set, get, result.data);
      await get().refreshList();
    }
    return result;
  },

  update: async (input) => {
    const result = await updateEvent(input);
    if (result.ok) {
      mergeIntoList(set, get, result.data);
      if (get().activeEventId === input.id) set({ detail: result.data });
      await get().refreshList();
      return result;
    }
    // 409 — someone changed it first. The server wins: reload, never re-push.
    if (result.kind === "rejected" && result.status === 409) {
      await get().loadDetail(input.id);
    }
    return result;
  },

  cancel: async (id, clientEventId) => {
    const result = await cancelEvent(id, clientEventId);
    if (result.ok) {
      mergeIntoList(set, get, result.data);
      if (get().activeEventId === id) set({ detail: result.data });
      await get().refreshList();
    }
    return result;
  },

  addPeople: async (id, people) => {
    const result = await addParticipants(id, people);
    if (result.ok) {
      mergeIntoList(set, get, result.data);
      if (get().activeEventId === id) set({ detail: result.data });
      await get().refreshList();
    }
    return result;
  },

  removePerson: async (id, chatuserId, userType) => {
    const result = await removeParticipant(id, chatuserId, userType);
    if (result.ok) {
      mergeIntoList(set, get, result.data);
      if (get().activeEventId === id) set({ detail: result.data });
      await get().refreshList();
    }
    return result;
  },
}));

/** Replace (or insert) an event in the list, keeping `eventTime` order. */
function mergeIntoList(
  set: (fn: (state: EventsStore) => Partial<EventsStore>) => void,
  _get: () => EventsStore,
  event: EventRecord
) {
  set((state) => {
    const exists = state.events.some((e) => e.id === event.id);
    const next = exists
      ? state.events.map((e) => (e.id === event.id ? event : e))
      : [...state.events, event];
    next.sort(
      (a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()
    );
    return { events: next };
  });
}

/** Upcoming = scheduled and still in the future. Everything else is past. */
export function splitEvents(events: EventRecord[], now: number = Date.now()) {
  const upcoming: EventRecord[] = [];
  const past: EventRecord[] = [];
  for (const e of events) {
    const at = new Date(e.eventTime).getTime();
    if (e.status === "scheduled" && Number.isFinite(at) && at > now) upcoming.push(e);
    else past.push(e);
  }
  // Past reads best newest-first; upcoming stays soonest-first.
  past.sort(
    (a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime()
  );
  return { upcoming, past };
}
