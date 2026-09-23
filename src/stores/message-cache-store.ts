import { create } from 'zustand';
import { format, subDays, isAfter } from 'date-fns';
import { apiHeader, getData } from '@/lib/api-helper';
import logger from '@/lib/logger';
import {
  applySelectionLocally,
  mergePoll,
  myVotesOf,
  type Poll,
} from '@/lib/polls';

const MAX_CACHED_CHATS = 10;
const MAX_CACHED_MESSAGES = 100;
// No staleness threshold — always background sync on switch

interface CachedChat {
  messages: any[];
  firstItemIndex: number;
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
  lastAccessedAt: number;
  lastMessageTime: string; // created timestamp of last message — used for sync
}

interface MessageCacheStore {
  cache: Record<string, CachedChat>;
  activeTalkId: string;

  // Current active chat state (derived from cache or fresh fetch)
  messages: any[];
  formattedMessages: any[];
  firstItemIndex: number;
  isLoading: boolean;
  isMsgApiCall: boolean;
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
  // Bumped on every MARK_UNREAD so the message list can drop the local
  // "already marked read" tracking that would otherwise suppress the label
  // and stop the message being re-read later.
  unreadMarkToken: number;
  // Actions
  switchChat: (talkId: string) => Promise<void>;
  getMessagesList: (
    talkId: string,
    fromMessageId?: string,
    direction?: string,
    limit?: number | string
  ) => Promise<void>;
  dispatchMessage: (action: MessageAction) => void;
  refreshPolls: (talkId: string) => Promise<void>;
  clearChat: (talkId: string) => void;
  clearAll: () => void;
}

type MessageAction =
  | { type: 'SET_MESSAGES'; payload: any[] }
  | { type: 'PREPEND_MESSAGES'; payload: any[] }
  | { type: 'APPEND_MESSAGES'; payload: any[] }
  | { type: 'ADD_MESSAGE'; payload: any }
  | { type: 'EDIT_MESSAGE'; payload: { messageId: string; messageText: string } }
  | { type: 'DELETE_MESSAGE'; payload: string }
  | { type: 'UPDATE_READ_STATUS'; payload: { messageId: string } }
  | { type: 'MARK_UNREAD'; payload: { messageId: string } }
  | { type: 'TOGGLE_REACTION'; payload: { messageId: string; chatuserId: string; userName: string; userProfile?: string; reaction: string } }
  | { type: 'TOGGLE_PIN'; payload: { messageId: string; isPinned: boolean } }
  | { type: 'UPDATE_MEDIA'; payload: { messageId?: string; mediaId?: string; mediaPath: string; mediaName?: string } }
  // `addressed` = the payload was sent to THIS user (message list, or our own
  // ack) and so carries a trustworthy `myVotes`/`canClose`. A `pollUpdated`
  // broadcast is not addressed.
  | { type: 'APPLY_POLL'; payload: { messageId: string; poll: Poll; addressed?: boolean } }
  | { type: 'SET_POLL_SELECTION'; payload: { messageId: string; optionIds: string[] } }
  | { type: 'MARK_POLL_CLOSED'; payload: { messageId: string } };

const START_INDEX = 1_000_000;
// userStage removed — endpoints now use common prefix

// A message deleted by an admin (senderType "ADMIN") is removed from the chat
// entirely — no "This message was deleted" tombstone — in BOTH the admin and
// employee apps. Messages deleted by an employee still show the tombstone.
function isAdminDeleted(m: any): boolean {
  return m.isDeleted && m.senderType === 'ADMIN';
}

// ── Pure helpers ──────────────────────────────────────────────

function formatMessagesWithDates(messages: any[]): any[] {
  const source = messages.filter((m) => !isAdminDeleted(m));
  if (!source.length) return [];
  const result: any[] = [];
  let lastDate = '';
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const yesterday = format(subDays(now, 1), 'yyyy-MM-dd');
  const oneWeekAgo = subDays(now, 7);

  for (const message of source) {
    const messageDate = format(new Date(message.created), 'yyyy-MM-dd');
    if (lastDate !== messageDate) {
      let dateLabel: string;
      if (messageDate === today) dateLabel = 'Today';
      else if (messageDate === yesterday) dateLabel = 'Yesterday';
      else if (isAfter(new Date(messageDate), oneWeekAgo))
        dateLabel = format(new Date(messageDate), 'EEEE');
      else dateLabel = format(new Date(messageDate), 'd MMMM yyyy');
      result.push({ type: 'status', text: dateLabel });
      lastDate = messageDate;
    }
    result.push({ type: 'message', ...message });
  }
  return result;
}

function countFormattedPrependItems(newMsgs: any[], existingMsgs: any[]): number {
  // Match the filtering done in formatMessagesWithDates so the Virtuoso scroll
  // anchor stays aligned when an older page contains admin-deleted messages.
  const src = newMsgs.filter((m) => !isAdminDeleted(m));
  const existing = existingMsgs.filter((m) => !isAdminDeleted(m));
  if (!src.length) return 0;
  let count = 0;
  let lastDate = '';
  for (const msg of src) {
    const d = format(new Date(msg.created), 'yyyy-MM-dd');
    if (lastDate !== d) { count++; lastDate = d; }
    count++;
  }
  if (existing.length > 0) {
    const lastNew = format(new Date(src[src.length - 1].created), 'yyyy-MM-dd');
    const firstExist = format(new Date(existing[0].created), 'yyyy-MM-dd');
    if (lastNew === firstExist) count--;
  }
  return count;
}

function applyMessageAction(messages: any[], action: MessageAction): any[] {
  switch (action.type) {
    case 'SET_MESSAGES': return action.payload;
    case 'PREPEND_MESSAGES': return [...action.payload, ...messages];
    case 'APPEND_MESSAGES': return [...messages, ...action.payload];
    case 'ADD_MESSAGE': {
      // `clientMsgId` is the create-side idempotency key (polls send one). The
      // server echoes it on the broadcast, so a row already added from the ack
      // is adopted rather than appended a second time.
      const incoming = action.payload;
      const existing = messages.findIndex(m =>
        m.messageId === incoming.messageId ||
        (incoming.clientMsgId && m.clientMsgId === incoming.clientMsgId));
      if (existing < 0) return [...messages, incoming];
      // Same message arriving again — keep whatever the addressed copy told us
      // about ourselves (`poll.myVotes`, `poll.canClose`); a broadcast omits both.
      const held = messages[existing];
      if (!held.poll || !incoming.poll) return messages;
      const poll = mergePoll(held.poll, incoming.poll, false);
      if (poll === held.poll) return messages;
      return messages.map((m, i) => (i === existing ? { ...m, ...incoming, poll } : m));
    }
    case 'EDIT_MESSAGE':
      return messages.map(m =>
        m.messageId === action.payload.messageId
          ? { ...m, messageText: action.payload.messageText, updated: new Date().toISOString() } : m);
    case 'DELETE_MESSAGE':
      // Keep the message but flag it so the bubble renders a
      // "This message was deleted" placeholder (WhatsApp-style)
      return messages.map(m =>
        m.messageId === action.payload ? { ...m, isDeleted: true } : m);
    case 'UPDATE_READ_STATUS': {
      const targetIdx = messages.findIndex(m => m.messageId === action.payload.messageId);
      if (targetIdx < 0) return messages;
      return messages.map((m, i) =>
        i <= targetIdx ? { ...m, unread: 0, isReadByAll: m.isReadByAll == '1' } : m);
    }
    case 'TOGGLE_REACTION': {
      const { messageId, chatuserId, userName, userProfile, reaction } = action.payload;
      return messages.map(m => {
        if (m.messageId !== messageId) return m;
        const currentReactions: Array<{ chatuserId: string; userName: string; userProfile?: string; reaction: string }> = m.reactions || [];
        const existingIndex = currentReactions.findIndex(
          r => r.chatuserId === chatuserId && r.reaction === reaction
        );
        const newReactions = existingIndex >= 0
          ? currentReactions.filter((_: any, i: number) => i !== existingIndex)
          : [...currentReactions, { chatuserId, userName, userProfile, reaction }];
        return { ...m, reactions: newReactions };
      });
    }
    case 'UPDATE_MEDIA': {
      // Backend finished converting an upload (HEIC → PNG) and handed us the
      // new path. The event fires per ATTACHMENT, so patch the matching entry
      // inside `mediaItems` — overwriting the message's top-level `mediaPath`
      // would replace the wrong image on an album.
      const { messageId, mediaId, mediaPath, mediaName } = action.payload;
      return messages.map(m => {
        const items: any[] | null = Array.isArray(m.mediaItems) ? m.mediaItems : null;
        const hitsItem = !!mediaId && !!items?.some((i: any) => i.mediaId === mediaId);
        const hit =
          hitsItem ||
          (messageId ? m.messageId === messageId : !!mediaId && m.mediaId === mediaId);
        if (!hit) return m;

        const next: any = { ...m };
        if (items) {
          next.mediaItems = items.map((i: any) =>
            !mediaId || i.mediaId === mediaId
              ? { ...i, mediaPath, ...(mediaName ? { mediaName } : {}) }
              : i
          );
        }
        // Keep the legacy top-level pointer in sync only when it IS the item
        // that changed, so a pre-album read path never shows another album item.
        if (!mediaId || !m.mediaId || m.mediaId === mediaId) {
          next.mediaPath = mediaPath;
          if (mediaName) next.mediaName = mediaName;
        }
        return next;
      });
    }
    case 'MARK_UNREAD': {
      // "Mark as unread from here" — the caller's `lastReadAt` was rewound, so
      // the target and everything newer becomes unread again for this user.
      const idx = messages.findIndex(m => m.messageId === action.payload.messageId);
      if (idx < 0) return messages;
      return messages.map((m, i) => (i >= idx ? { ...m, unread: 1 } : m));
    }
    case 'TOGGLE_PIN': {
      const { messageId, isPinned } = action.payload;
      return messages.map(m =>
        m.messageId === messageId ? { ...m, isPinned } : m
      );
    }
    case 'APPLY_POLL': {
      const { messageId, poll, addressed } = action.payload;
      // A `pollUpdated` for a message we do not hold is normal — the talk is not
      // open, or the message has not loaded yet. Ignore it; never fetch.
      const idx = messages.findIndex(m => m.messageId === messageId);
      if (idx < 0) return messages;
      const merged = mergePoll(messages[idx].poll, poll, !!addressed);
      // Stale (revision ≤ the one held) — `mergePoll` hands back the same object.
      if (merged === messages[idx].poll) return messages;
      return messages.map((m, i) => (i === idx ? { ...m, poll: merged } : m));
    }
    case 'SET_POLL_SELECTION': {
      // Optimistic: the user's complete selection plus the count adjustments
      // that keep the bars from jumping when the real payload lands.
      const { messageId, optionIds } = action.payload;
      const idx = messages.findIndex(m => m.messageId === messageId);
      if (idx < 0 || !messages[idx].poll) return messages;
      const held: Poll = messages[idx].poll;
      const before = myVotesOf(held);
      if (before.length === optionIds.length &&
          before.every(id => optionIds.includes(id))) return messages;
      return messages.map((m, i) =>
        i === idx ? { ...m, poll: applySelectionLocally(held, optionIds) } : m);
    }
    case 'MARK_POLL_CLOSED': {
      const idx = messages.findIndex(m => m.messageId === action.payload.messageId);
      if (idx < 0 || !messages[idx].poll) return messages;
      if (messages[idx].poll.isClosed) return messages;
      return messages.map((m, i) =>
        i === idx ? { ...m, poll: { ...m.poll, isClosed: true } } : m);
    }
    default: return messages;
  }
}

/** Evict oldest-accessed chats if cache exceeds MAX_CACHED_CHATS */
function evictLRU(cache: Record<string, CachedChat>, keepTalkId: string): Record<string, CachedChat> {
  const keys = Object.keys(cache);
  if (keys.length <= MAX_CACHED_CHATS) return cache;

  const sorted = keys
    .filter(k => k !== keepTalkId)
    .sort((a, b) => cache[a].lastAccessedAt - cache[b].lastAccessedAt);

  const newCache = { ...cache };
  const toRemove = sorted.slice(0, keys.length - MAX_CACHED_CHATS);
  for (const key of toRemove) {
    delete newCache[key];
  }
  return newCache;
}

/**
 * Sync cached messages with fresh API data.
 * - Detects DELETED messages: cached messageIds not present in fresh data
 * - Detects EDITED messages: compare updated timestamps
 * - Adds NEW messages: fresh messageIds not in cached set
 * Returns the merged message array.
 */
function syncMessages(cached: any[], fresh: any[]): any[] {
  const freshMap = new Map<string, any>();
  for (const msg of fresh) freshMap.set(msg.messageId, msg);

  const cachedMap = new Map<string, any>();
  for (const msg of cached) cachedMap.set(msg.messageId, msg);

  // Start with cached messages, update or remove as needed
  const result: any[] = [];

  for (const msg of cached) {
    const freshVersion = freshMap.get(msg.messageId);
    if (!freshVersion) {
      // Message was DELETED on server — skip it
      continue;
    }
    // Check if EDITED — compare updated timestamps
    if (freshVersion.updated && msg.updated !== freshVersion.updated) {
      result.push(freshVersion); // Use the fresh (edited) version
    } else if (freshVersion.poll) {
      // A vote changes the poll without touching the message's `updated`, so an
      // otherwise-unchanged row still needs the fresh tally. The list is
      // addressed to us, so it carries `myVotes` and `canClose` too.
      const poll = mergePoll(msg.poll, freshVersion.poll, true);
      result.push(poll === msg.poll ? msg : { ...msg, poll });
    } else {
      result.push(msg); // Keep cached version (unchanged)
    }
  }

  // Add any NEW messages from fresh that aren't in cached
  for (const msg of fresh) {
    if (!cachedMap.has(msg.messageId)) {
      result.push(msg);
    }
  }

  // Sort by created timestamp to maintain order
  result.sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());

  return result;
}

// ── Fetch-in-progress refs (outside Zustand — synchronous guards) ──
let _olderFetchInProgress = false;
let _newerFetchInProgress = false;
let _olderFetchPromise: Promise<void> | null = null;
let _newerFetchPromise: Promise<void> | null = null;

/** Wait for any in-progress older-message fetch to complete */
export function waitForOlderFetch(): Promise<void> {
  return _olderFetchPromise ?? Promise.resolve();
}

// ── Store ─────────────────────────────────────────────────────

export const useMessageCacheStore = create<MessageCacheStore>((set, get) => ({
  cache: {},
  activeTalkId: '',
  messages: [],
  formattedMessages: [],
  firstItemIndex: START_INDEX,
  isLoading: false,
  isMsgApiCall: false,
  hasMoreOlder: true,
  hasMoreNewer: true,
  unreadMarkToken: 0,
  switchChat: async (talkId: string) => {
    if (!talkId) return;

    // Reset fetch guards when switching chats — prevents stale locks from previous chat
    _olderFetchInProgress = false;
    _newerFetchInProgress = false;

    const { cache } = get();
    const cached = cache[talkId];

    if (cached) {
      // Step 1: Show skeleton — clear old messages, set loading
      set({
        activeTalkId: talkId,
        messages: [],
        formattedMessages: [],
        firstItemIndex: START_INDEX,
        isLoading: true,
        isMsgApiCall: false,
        hasMoreOlder: cached.hasMoreOlder,
        hasMoreNewer: false,
        cache: {
          ...cache,
          [talkId]: { ...cached, lastAccessedAt: Date.now() },
        },
      });

      // Step 2: Yield to let React render the skeleton, then set cached data
      await new Promise((r) => requestAnimationFrame(r));
      if (get().activeTalkId !== talkId) return;

      set({
        messages: cached.messages,
        formattedMessages: formatMessagesWithDates(cached.messages),
        firstItemIndex: cached.firstItemIndex,
        isLoading: false,
        hasMoreOlder: cached.hasMoreOlder,
        hasMoreNewer: false,
        isMsgApiCall: true,
      });

      // ALWAYS background sync — fetch newer messages + detect edits/deletes
      const lastMsg = cached.messages[cached.messages.length - 1];
      if (lastMsg?.messageId) {
        try {
          const response: any = await getData(
            'chat/message/list',
            { talkId, fromMessageId: lastMsg.messageId, direction: 'newer', limit: -1 },
            apiHeader(false, 0)
          );
          if (String(response?.status) === '200' && String(response?.data.status) === '200') {
            const freshMsgs: any[] = response.data.data;
            if (get().activeTalkId !== talkId) return;
            if (freshMsgs.length > 0) {
              const { messages: currentMsgs } = get();
              const synced = syncMessages(currentMsgs, [...currentMsgs, ...freshMsgs]);
              const trimmed = synced.slice(-MAX_CACHED_MESSAGES);
              const bgWasTrimmed = synced.length > MAX_CACHED_MESSAGES;
              set((state) => ({
                messages: synced,
                formattedMessages: formatMessagesWithDates(synced),
                hasMoreNewer: false,
                cache: {
                  ...state.cache,
                  [talkId]: {
                    ...state.cache[talkId],
                    hasMoreOlder: bgWasTrimmed ? true : (state.cache[talkId]?.hasMoreOlder ?? true),
                    firstItemIndex: bgWasTrimmed ? START_INDEX : (state.cache[talkId]?.firstItemIndex ?? START_INDEX),

                    messages: trimmed,
                    lastMessageTime: synced[synced.length - 1]?.created || '',
                    lastAccessedAt: Date.now(),
                  },
                },
              }));
            }
          }
        } catch (err) {
          logger.error('Background sync failed:', err);
        }
      }
    } else {
      // FRESH: No cache — fetch from API
      set({
        activeTalkId: talkId,
        messages: [],
        formattedMessages: [],
        firstItemIndex: START_INDEX,
        hasMoreOlder: true,
        hasMoreNewer: true,
        isMsgApiCall: false,
        isLoading: true,

      });

      await get().getMessagesList(talkId, '', '', -1);
    }

    // Also do a FULL sync for edits/deletes
    try {
      const response: any = await getData(
        'chat/message/list',
        { talkId, fromMessageId: '', direction: '', limit: -1 },
        apiHeader(false, 0)
      );
      if (String(response?.status) === '200' && String(response?.data.status) === '200') {
        const freshFull: any[] = response.data.data;
        const { messages: currentMsgs, activeTalkId } = get();
        if (activeTalkId !== talkId) return;
        if (currentMsgs.length > 0 && freshFull.length > 0) {
          const synced = syncMessages(currentMsgs, freshFull);
          if (JSON.stringify(synced.map(m => m.messageId)) !== JSON.stringify(currentMsgs.map(m => m.messageId))
            || synced.some((m, i) => m.updated !== currentMsgs[i]?.updated)) {
            const trimmed = synced.slice(-MAX_CACHED_MESSAGES);
            const fsWasTrimmed = synced.length > MAX_CACHED_MESSAGES;
            set((state) => ({
              messages: synced,
              formattedMessages: formatMessagesWithDates(synced),
              cache: {
                ...state.cache,
                [talkId]: {
                  ...state.cache[talkId],
                  hasMoreOlder: fsWasTrimmed ? true : (state.cache[talkId]?.hasMoreOlder ?? true),
                  firstItemIndex: fsWasTrimmed ? START_INDEX : (state.cache[talkId]?.firstItemIndex ?? START_INDEX),

                  messages: trimmed,
                  lastMessageTime: synced[synced.length - 1]?.created || '',
                  lastAccessedAt: Date.now(),
                },
              },
            }));
          }
        }
      }
    } catch (err) {
      // Silent fail — cache is already shown
    }
  },

  getMessagesList: async (talkId, fromMessageId = '', direction = '', limit = -1) => {
    if (direction === 'older') {
      if (_olderFetchInProgress) {
        // Wait for the current fetch to finish instead of dropping the call
        if (_olderFetchPromise) await _olderFetchPromise;
        return;
      }
      _olderFetchInProgress = true;
    }
    if (direction === 'newer') {
      if (_newerFetchInProgress) {
        if (_newerFetchPromise) await _newerFetchPromise;
        return;
      }
      _newerFetchInProgress = true;
    }

    if (!direction) set({ isMsgApiCall: false });
    set({ isLoading: true });

    const fetchWork = async () => {
      try {
        const response: any = await getData(
          'chat/message/list',
          { talkId, fromMessageId, direction, limit },
          apiHeader(false, 0)
        );

        if (get().activeTalkId !== talkId) return;

        if (String(response?.status) === '200' && String(response?.data.status) === '200') {
          const data: any[] = response.data.data;
          const { messages: currentMsgs, firstItemIndex: currentFII, cache } = get();

          let newMsgs: any[];
          let newFII = currentFII;
          let newHasMoreOlder = get().hasMoreOlder;
          let newHasMoreNewer = get().hasMoreNewer;

          if (direction === 'newer') {
            const existingIds = new Set(currentMsgs.map((m: any) => m.messageId));
            const uniqueNew = data.filter((m: any) => !existingIds.has(m.messageId));
            newMsgs = [...currentMsgs, ...uniqueNew];
            newHasMoreNewer = data.length === limit;
          } else if (direction === 'older') {
            const existingIds = new Set(currentMsgs.map((m: any) => m.messageId));
            const uniqueOld = data.filter((m: any) => !existingIds.has(m.messageId));
            const fmtCount = countFormattedPrependItems(uniqueOld, currentMsgs);
            newMsgs = [...uniqueOld, ...currentMsgs];
            newFII = currentFII - fmtCount;
            newHasMoreOlder = data.length === limit;
          } else {
            newMsgs = data;
            newFII = START_INDEX;
            newHasMoreOlder = data.length >= 50;
            newHasMoreNewer = false;
          }

          const trimmed = newMsgs.slice(-MAX_CACHED_MESSAGES);
          const wasTrimmed = newMsgs.length > MAX_CACHED_MESSAGES;
          const cachedHasMoreOlder = wasTrimmed ? true : newHasMoreOlder;
          const updatedCache = evictLRU({
            ...cache,
            [talkId]: {
              messages: trimmed,
              firstItemIndex: wasTrimmed ? START_INDEX : newFII,
              hasMoreOlder: cachedHasMoreOlder,
              hasMoreNewer: newHasMoreNewer,
              lastAccessedAt: Date.now(),
              lastMessageTime: newMsgs[newMsgs.length - 1]?.created || '',
            },
          }, talkId);

          set({
            messages: newMsgs,
            formattedMessages: formatMessagesWithDates(newMsgs),
            firstItemIndex: newFII,
            hasMoreOlder: newHasMoreOlder,
            hasMoreNewer: newHasMoreNewer,
            isMsgApiCall: true,
            cache: updatedCache,
          });
        } else {
          if (get().activeTalkId !== talkId) return;
          if (direction === 'older') set({ hasMoreOlder: false });
          else if (direction === 'newer') set({ hasMoreNewer: false });
          else set({ hasMoreOlder: false, hasMoreNewer: false });
          set({ isMsgApiCall: true });
        }
      } catch (err) {
        logger.error('getMessagesList failed:', err);
        if (get().activeTalkId !== talkId) return;
        set({ hasMoreOlder: false, hasMoreNewer: false, isMsgApiCall: true });
      } finally {
        if (get().activeTalkId === talkId) {
          set({ isLoading: false });
        }
        if (direction === 'older') {
          _olderFetchInProgress = false;
          _olderFetchPromise = null;
        }
        if (direction === 'newer') {
          _newerFetchInProgress = false;
          _newerFetchPromise = null;
        }
      }
    };

    const promise = fetchWork();
    if (direction === 'older') _olderFetchPromise = promise;
    if (direction === 'newer') _newerFetchPromise = promise;
    await promise;
  },

  dispatchMessage: (action: MessageAction) => {
    const { messages: currentMsgs, activeTalkId, cache, firstItemIndex } = get();
    const newMsgs = applyMessageAction(currentMsgs, action);

    let newFII = firstItemIndex;
    if (action.type === 'PREPEND_MESSAGES') {
      newFII -= countFormattedPrependItems(action.payload, currentMsgs);
    }

    const trimmed = newMsgs.slice(-MAX_CACHED_MESSAGES);
    const dmWasTrimmed = newMsgs.length > MAX_CACHED_MESSAGES;

    set((state) => ({
      messages: newMsgs,
      formattedMessages: formatMessagesWithDates(newMsgs),
      firstItemIndex: newFII,
      unreadMarkToken:
        action.type === 'MARK_UNREAD'
          ? state.unreadMarkToken + 1
          : state.unreadMarkToken,
      cache: {
        ...cache,
        [activeTalkId]: {
          ...(cache[activeTalkId] || {
            firstItemIndex: START_INDEX,
            hasMoreOlder: true,
            hasMoreNewer: false,
          }),
          hasMoreOlder: dmWasTrimmed ? true : (cache[activeTalkId]?.hasMoreOlder ?? true),
          firstItemIndex: dmWasTrimmed ? START_INDEX : newFII,
          messages: trimmed,
          lastAccessedAt: Date.now(),
          lastMessageTime: newMsgs[newMsgs.length - 1]?.created || '',
        },
      },
    }));
  },

  /**
   * Re-read every poll in the open talk from the message list.
   *
   * Used after a socket reconnect: `pollUpdated` broadcasts sent during the gap
   * are simply gone, and the newer-messages catch-up only appends rows — it
   * never refreshes a poll that was already on screen. The list is addressed to
   * this user, so it restores `myVotes` and `canClose` as well as the tally,
   * and it touches only the `poll` field so the scroll anchor is left alone.
   */
  refreshPolls: async (talkId: string) => {
    if (!talkId) return;
    const hasPolls = get().messages.some((m: any) => m.poll);
    if (!hasPolls) return;
    try {
      const response: any = await getData(
        'chat/message/list',
        { talkId, fromMessageId: '', direction: '', limit: -1 },
        apiHeader(false, 0)
      );
      if (String(response?.data?.status) !== '200') return;
      if (get().activeTalkId !== talkId) return;
      const fresh: any[] = Array.isArray(response.data.data) ? response.data.data : [];
      for (const msg of fresh) {
        if (!msg?.poll || !msg?.messageId) continue;
        get().dispatchMessage({
          type: 'APPLY_POLL',
          payload: { messageId: msg.messageId, poll: msg.poll, addressed: true },
        });
      }
    } catch (err) {
      logger.error('refreshPolls failed:', err);
    }
  },

  clearChat: (talkId) => {
    const { cache, activeTalkId } = get();
    const { [talkId]: _, ...rest } = cache;
    if (talkId === activeTalkId) {
      set({
        cache: rest,
        activeTalkId: '',
        messages: [],
        formattedMessages: [],
        firstItemIndex: START_INDEX,
        isLoading: false,
        isMsgApiCall: false,
        hasMoreOlder: true,
        hasMoreNewer: true,

      });
    } else {
      set({ cache: rest });
    }
  },

  clearAll: () => {
    _olderFetchInProgress = false;
    _newerFetchInProgress = false;
    set({
      cache: {},
      activeTalkId: '',
      messages: [],
      formattedMessages: [],
      firstItemIndex: START_INDEX,
      isLoading: false,
      isMsgApiCall: false,
      hasMoreOlder: true,
      hasMoreNewer: true,

    });
  },
}));

export type { MessageAction };
