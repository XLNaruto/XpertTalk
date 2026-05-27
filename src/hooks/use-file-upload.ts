import { useState, useRef, useCallback } from "react";
import logger from "@/lib/logger";
import { toast } from "sonner";
import { apiHeader, postData } from "@/lib/api-helper";

// ── Constants ─────────────────────────────────────────────────

const DOC_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/pdf",
];

const VIDEO_TYPES = [
  "video/mp4",
  "video/x-m4v",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/webm",
];

const IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/bmp",
  "image/webp",
  "image/svg+xml",
];

const ALL_ALLOWED = [...DOC_TYPES, ...VIDEO_TYPES, ...IMAGE_TYPES];

const MAX_DOC_IMAGE_SIZE = 12 * 1024 * 1024; // 12 MB
const MAX_VIDEO_SIZE = 18 * 1024 * 1024; // 18 MB

// ── Types ─────────────────────────────────────────────────────

type FileType = "IMAGE" | "VIDEO" | "DOCUMENT";

interface UseFileUploadOptions {
  emit: (event: string, data?: any, ack?: (response: any) => void) => void;
  isConnected: boolean;
}

// ── Hook ──────────────────────────────────────────────────────

export default function useFileUpload({
  emit,
  isConnected,
}: UseFileUploadOptions) {
  // ── State ──
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isFileDragging, setIsFileDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // ── Refs ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Store latest emit/isConnected in refs to avoid stale closures
  const emitRef = useRef(emit);
  emitRef.current = emit;
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

  // ── Utilities ──

  const getFileType = useCallback((file: File): FileType => {
    if (file.type.startsWith("image/")) return "IMAGE";
    if (file.type.startsWith("video/")) return "VIDEO";
    return "DOCUMENT";
  }, []);

  const isImage = useCallback(
    (file: File): boolean => file.type.startsWith("image/"),
    []
  );

  // ── Actions ──

  const addFiles = useCallback((newFiles: File[]) => {
    const validFiles: File[] = [];
    const oversizedFiles: string[] = [];
    const invalidFiles: string[] = [];

    newFiles.forEach((file) => {
      if (!ALL_ALLOWED.includes(file.type)) {
        invalidFiles.push(file.name);
        return;
      }

      if (
        DOC_TYPES.includes(file.type) ||
        IMAGE_TYPES.includes(file.type)
      ) {
        if (file.size <= MAX_DOC_IMAGE_SIZE) {
          validFiles.push(file);
        } else {
          oversizedFiles.push(`${file.name} (max 12MB allowed)`);
        }
      } else if (VIDEO_TYPES.includes(file.type)) {
        if (file.size <= MAX_VIDEO_SIZE) {
          validFiles.push(file);
        } else {
          oversizedFiles.push(`${file.name} (max 18MB allowed)`);
        }
      }
    });

    if (invalidFiles.length > 0) {
      toast.error(
        `The following files are not supported:\n- ${invalidFiles.join("\n- ")}`
      );
    }

    if (oversizedFiles.length > 0) {
      toast.error(
        `The following files exceed allowed size:\n- ${oversizedFiles.join(
          "\n- "
        )}`
      );
    }

    if (validFiles.length > 0) {
      setSelectedFiles((prev) => {
        const total = prev.length + validFiles.length;
        if (total > 10) {
          toast.error("Maximum 10 files allowed at a time");
          const allowed = 10 - prev.length;
          return allowed > 0 ? [...prev, ...validFiles.slice(0, allowed)] : prev;
        }
        return [...prev, ...validFiles];
      });
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  // ── Upload ──

  const uploadFiles = useCallback(
    async (_talkId: string, replyMessageId?: string | null) => {
      if (selectedFiles.length === 0) return;
      setIsUploading(true);

      try {
        const uploadPromises = selectedFiles.map(async (file) => {
          const param = new FormData();
          param.append("name", file.name);
          param.append("type", getFileType(file));
          param.append("media", file);

          try {
            const response: any = await postData(
              "chat/media/upload",
              param,
              apiHeader(true, 0)
            );

            if (
              String(response?.status) === "200" &&
              String(response?.data.status) === "200"
            ) {
              const data = response.data.data;
              if (isConnectedRef.current) {
                const messageData: any = {
                  mediaId: data.mediaId,
                  messageType: data.type,
                };
                if (replyMessageId) {
                  messageData.replyToMessageId = replyMessageId;
                }
                emitRef.current("sendMessage", messageData);
              }
            } else {
              logger.warn("Failed to upload:", file.name);
            }
          } catch (error) {
            logger.error("Error uploading file:", file.name, error);
          }
        });

        await Promise.all(uploadPromises);
        setSelectedFiles([]);
      } finally {
        setIsUploading(false);
      }
    },
    [selectedFiles, getFileType]
  );

  // ── File picker ──

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── Event handlers ──

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      addFiles(files);
      event.target.value = ""; // reset so same file can be re-selected
    },
    [addFiles]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(event.clipboardData.items);
      const pastedFiles: File[] = [];

      items.forEach((item) => {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      });

      if (pastedFiles.length > 0) {
        addFiles(pastedFiles);
      }
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (dragCounter.current === 1) {
      setIsFileDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsFileDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsFileDragging(false);
      dragCounter.current = 0;
      const files = Array.from(e.dataTransfer.files);
      addFiles(files);
    },
    [addFiles]
  );

  return {
    selectedFiles,
    isFileDragging,
    isUploading,
    fileInputRef,
    addFiles,
    removeFile,
    clearFiles,
    uploadFiles,
    openFilePicker,
    handleFileChange,
    handlePaste,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    isImage,
    getFileType,
  };
}
