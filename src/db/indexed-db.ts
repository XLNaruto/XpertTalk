import { encrypt, decrypt } from "@/lib/encryption";

const stringToBytes = (str: string): Uint8Array =>
  new TextEncoder().encode(str);

const bytesToString = (bytes: Uint8Array): string =>
  new TextDecoder().decode(bytes);

// Expiry limit (24 hours)
const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000;

export const openDraftDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("XLTDDB", 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts", { keyPath: "talkId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveDraftToDB = async (draft: {
  talkId: string;
  message: string;
  attachments: File[];
  timestamp: number;
  replyMessageId?: string | null;
  replyMessage?: any | null;
  isReply?: boolean;
  isEditing?: boolean;
  editingMessageId?: string | null;
}) => {
  const db = await openDraftDB();

  // Cleanup expired drafts before saving
  const cleanupTx = db.transaction("drafts", "readwrite");
  const cleanupStore = cleanupTx.objectStore("drafts");
  const getAllReq = cleanupStore.getAll();

  getAllReq.onsuccess = () => {
    const allDrafts = getAllReq.result || [];
    const now = Date.now();
    allDrafts.forEach((d: any) => {
      if (now - d.timestamp > DRAFT_EXPIRY_MS) {
        cleanupStore.delete(d.talkId);
      }
    });
  };

  const attachmentsForDB = await Promise.all(
    draft.attachments.map(async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      return { name: file.name, type: file.type, blob: arrayBuffer };
    })
  );

  const messageBytes = stringToBytes(draft.message);
  const messageStr = Array.from(messageBytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  const encryptedMessage = encrypt(messageStr);

  const draftForDB = {
    talkId: draft.talkId,
    message: encryptedMessage,
    attachments: attachmentsForDB,
    timestamp: draft.timestamp,
    replyMessageId: draft.replyMessageId ?? null,
    replyMessage: draft.replyMessage ?? null,
    isReply: draft.isReply ?? false,
    isEditing: draft.isEditing ?? false,
    editingMessageId: draft.editingMessageId ?? null,
  };

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    store.put(draftForDB);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const loadDraftFromDB = async (talkId: string) => {
  const db = await openDraftDB();

  return new Promise<any | null>((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const store = tx.objectStore("drafts");
    const request = store.get(talkId);

    request.onsuccess = () => {
      if (request.result) {
        const savedDraft = request.result;
        const now = Date.now();

        if (now - savedDraft.timestamp > DRAFT_EXPIRY_MS) {
          const deleteTx = db.transaction("drafts", "readwrite");
          deleteTx.objectStore("drafts").delete(talkId);
          deleteTx.oncomplete = () => resolve(null);
          return;
        }

        const decryptedStr = decrypt(savedDraft.message);
        const decryptedBytes = new Uint8Array(
          Array.from(decryptedStr).map((ch) => ch.charCodeAt(0))
        );
        const decryptedMessage = bytesToString(decryptedBytes);

        const restoredAttachments: File[] = savedDraft.attachments.map(
          (att: any) => new File([att.blob], att.name, { type: att.type })
        );

        resolve({
          talkId: savedDraft.talkId,
          message: decryptedMessage,
          attachments: restoredAttachments,
          timestamp: savedDraft.timestamp,
          replyMessageId: savedDraft.replyMessageId ?? null,
          replyMessage: savedDraft.replyMessage ?? null,
          isReply: savedDraft.isReply ?? false,
          isEditing: savedDraft.isEditing ?? false,
          editingMessageId: savedDraft.editingMessageId ?? null,
        });
      } else {
        resolve(null);
      }
    };

    request.onerror = () => reject(request.error);
  });
};

export const getAllDraftsFromDB = async () => {
  const db = await openDraftDB();

  return new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const store = tx.objectStore("drafts");
    const request = store.getAll();

    request.onsuccess = () => {
      const now = Date.now();
      const drafts = request.result || [];

      const validDrafts = drafts.filter((d: any) => {
        if (now - d.timestamp > DRAFT_EXPIRY_MS) {
          const deleteTx = db.transaction("drafts", "readwrite");
          deleteTx.objectStore("drafts").delete(d.talkId);
          return false;
        }
        return true;
      });

      resolve(validDrafts);
    };

    request.onerror = () => reject(request.error);
  });
};
