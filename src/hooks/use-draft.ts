import { useState, useRef, useEffect, useCallback } from "react";
import logger from "@/lib/logger";
import {
  loadDraftFromDB,
  openDraftDB,
  saveDraftToDB,
} from "@/db/indexed-db";

// ── Types ─────────────────────────────────────────────────────

export interface DraftState {
  message: string;
  attachments: File[];
  replyMessageId: string | null;
  replyMessage: any;
  isReply: boolean;
  isEditing: boolean;
  editingMessageId: string | null;
}

interface UseDraftOptions {
  talkId: string;
  state: DraftState;
  onDraftLoaded: (draft: DraftState | null) => void;
}

// ── Hook ──────────────────────────────────────────────────────

export default function useDraft({
  talkId,
  state,
  onDraftLoaded,
}: UseDraftOptions) {
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);

  // Store callback in ref to avoid stale closures and re-triggering effects
  const onDraftLoadedRef = useRef(onDraftLoaded);
  onDraftLoadedRef.current = onDraftLoaded;

  // Store state in ref so auto-save doesn't need state in its dependency array
  const stateRef = useRef(state);
  stateRef.current = state;

  const talkIdRef = useRef(talkId);
  talkIdRef.current = talkId;

  // ── Load draft ──

  const loadDraft = useCallback(async (): Promise<DraftState | null> => {
    const id = talkIdRef.current;
    if (!id) return null;

    try {
      const draft = await loadDraftFromDB(id);
      if (draft) {
        return {
          message: draft.message,
          attachments: draft.attachments || [],
          replyMessageId: draft.replyMessageId || null,
          replyMessage: draft.replyMessage || {},
          isReply: draft.isReply || false,
          isEditing: draft.isEditing || false,
          editingMessageId: draft.editingMessageId || null,
        };
      }
      return null;
    } catch (error) {
      logger.error("Failed to load draft:", error);
      return null;
    }
  }, []);

  // Auto-load when talkId changes
  useEffect(() => {
    if (!talkId) {
      setIsDraftLoaded(true);
      return;
    }

    setIsDraftLoaded(false);

    loadDraftFromDB(talkId)
      .then((draft) => {
        if (draft) {
          onDraftLoadedRef.current({
            message: draft.message,
            attachments: draft.attachments || [],
            replyMessageId: draft.replyMessageId || null,
            replyMessage: draft.replyMessage || {},
            isReply: draft.isReply || false,
            isEditing: draft.isEditing || false,
            editingMessageId: draft.editingMessageId || null,
          });
        } else {
          onDraftLoadedRef.current(null);
        }
        setIsDraftLoaded(true);
      })
      .catch((error) => {
        logger.error("Failed to load draft:", error);
        onDraftLoadedRef.current(null);
        setIsDraftLoaded(true);
      });
  }, [talkId]);

  // ── Clear draft ──

  const clearDraft = useCallback(async () => {
    const id = talkIdRef.current;
    if (!id) return;

    try {
      const db = await openDraftDB();
      const tx = db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      store.delete(id);
      tx.oncomplete = () => logger.debug("Draft cleared after send");
      tx.onerror = () => logger.error("Failed to clear draft");
    } catch (error) {
      logger.error("Failed to clear draft:", error);
    }
  }, []);

  // ── Auto-save with debounce ──

  useEffect(() => {
    if (!talkId) return;

    const handler = setTimeout(async () => {
      try {
        const current = stateRef.current;
        await saveDraftToDB({
          talkId,
          message: current.message,
          attachments: current.attachments,
          timestamp: Date.now(),
          replyMessageId: current.replyMessageId,
          replyMessage: current.replyMessage,
          isReply: current.isReply,
          isEditing: current.isEditing,
          editingMessageId: current.editingMessageId,
        });
      } catch (err) {
        logger.error("Draft save failed:", err);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [
    talkId,
    state.message,
    state.attachments,
    state.replyMessageId,
    state.replyMessage,
    state.isReply,
    state.isEditing,
    state.editingMessageId,
  ]);

  return { loadDraft, clearDraft, isDraftLoaded };
}
