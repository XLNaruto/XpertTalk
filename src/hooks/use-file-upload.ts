import { useState, useRef, useCallback } from "react";
import logger from "@/lib/logger";
import { toast } from "sonner";
import { apiHeader, postData } from "@/lib/api-helper";
import { encodeBitmapToBlob } from "@/lib/image-encode";

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
  "image/heic",
  "image/heif",
];

const ALL_ALLOWED = [...DOC_TYPES, ...VIDEO_TYPES, ...IMAGE_TYPES];

const MAX_DOC_IMAGE_SIZE = 12 * 1024 * 1024; // 12 MB
const MAX_VIDEO_SIZE = 18 * 1024 * 1024; // 18 MB

// ── HEIC/HEIF handling ────────────────────────────────────────
// Most browsers (Chrome, Firefox, Edge) can't render HEIC/HEIF in an <img>,
// so we convert to JPEG on the client before upload. HEIC files also often
// report an empty MIME type, so we detect by extension as a fallback.

const HEIC_EXT = /\.(heic|heif)$/i;

function isHeicFile(file: File): boolean {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    (file.type === "" && HEIC_EXT.test(file.name))
  );
}

// A pasted image can arrive as a URL/text (e.g. browser "Copy image address")
// rather than file bytes. Detect that and fetch it into a real File.
const IMAGE_URL_RE =
  /^https?:\/\/\S+\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)(\?\S*)?$/i;

function isProbableImageUrl(text: string): boolean {
  return IMAGE_URL_RE.test(text);
}

async function fetchUrlAsFile(url: string): Promise<File | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const name = url.split("?")[0].split("/").pop() || "image";
    return new File([blob], name, { type: blob.type });
  } catch {
    return null;
  }
}

// Re-encode an oversized image to JPEG so it fits under `maxBytes`. Used for
// pasted images: the clipboard hands us a large lossless PNG (Chrome only keeps
// images as PNG), which for a big photo easily exceeds the upload limit even
// though the original file was small. We shrink quality first, then dimensions.
async function compressImageToLimit(file: File, maxBytes: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const encode = (w: number, h: number, q: number) =>
      encodeBitmapToBlob(bitmap, w, h, "image/jpeg", q);

    let quality = 0.9;
    let blob = await encode(width, height, quality);
    // Drop quality first (keeps full resolution).
    while (blob.size > maxBytes && quality > 0.5) {
      quality = Math.round((quality - 0.1) * 10) / 10;
      blob = await encode(width, height, quality);
    }
    // Still too big — scale the dimensions down.
    while (blob.size > maxBytes && width > 1000) {
      width = Math.round(width * 0.8);
      height = Math.round(height * 0.8);
      blob = await encode(width, height, 0.85);
    }

    const name = `${file.name.replace(/\.[^.]+$/, "")}.jpg`;
    return new File([blob], name, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close?.();
  }
}

async function convertHeicToJpeg(file: File): Promise<File> {
  // Dynamic import keeps the heavy libheif wasm out of the main bundle.
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  const newName = `${file.name.replace(HEIC_EXT, "")}.jpg`;
  return new File([blob], newName, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

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

  const addFiles = useCallback(async (
    newFiles: File[],
    opts?: { compressOversizedImages?: boolean }
  ) => {
    // Convert any HEIC/HEIF files to JPEG first so they display in all browsers.
    let incomingFiles = newFiles;
    if (newFiles.some(isHeicFile)) {
      const toastId = toast.loading("Please wait…");
      const failedConversions: string[] = [];
      const converted = await Promise.all(
        newFiles.map(async (file) => {
          if (!isHeicFile(file)) return file;
          try {
            return await convertHeicToJpeg(file);
          } catch (error) {
            logger.error("HEIC conversion failed:", file.name, error);
            failedConversions.push(file.name);
            return null;
          }
        })
      );
      toast.dismiss(toastId);
      incomingFiles = converted.filter((f): f is File => f !== null);
      if (failedConversions.length > 0) {
        toast.error(
          `Could not convert the following images:\n- ${failedConversions.join(
            "\n- "
          )}`
        );
      }
    }

    // Rescue oversized images (e.g. a big PNG pasted from the clipboard) by
    // re-encoding them to JPEG so they fit under the image size limit.
    if (opts?.compressOversizedImages) {
      const needsCompress = incomingFiles.some(
        (f) => f.type.startsWith("image/") && f.size > MAX_DOC_IMAGE_SIZE
      );
      if (needsCompress) {
        const toastId = toast.loading("Please wait…");
        incomingFiles = await Promise.all(
          incomingFiles.map(async (file) => {
            if (!file.type.startsWith("image/") || file.size <= MAX_DOC_IMAGE_SIZE) {
              return file;
            }
            try {
              return await compressImageToLimit(file, MAX_DOC_IMAGE_SIZE);
            } catch (error) {
              logger.error("Image compression failed:", file.name, error);
              return file; // fall through to the normal size check
            }
          })
        );
        toast.dismiss(toastId);
      }
    }

    const validFiles: File[] = [];
    const oversizedFiles: string[] = [];
    const invalidFiles: string[] = [];

    incomingFiles.forEach((file) => {
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
        addFiles(pastedFiles, { compressOversizedImages: true });
        return;
      }

      // No file bytes on the clipboard — handle a pasted image URL by fetching
      // it into a File (so it shows in the preview instead of dropping the raw
      // link into the input). preventDefault stops the URL text being inserted.
      const text = event.clipboardData.getData("text/plain")?.trim();
      if (text && isProbableImageUrl(text)) {
        event.preventDefault();
        fetchUrlAsFile(text)
          .then((file) => {
            if (file) addFiles([file], { compressOversizedImages: true });
            else toast.error("Couldn't load the pasted image");
          })
          .catch(() => toast.error("Couldn't load the pasted image"));
      }
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only react to drags that carry files, not dragged text/links/elements.
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounter.current += 1;
    if (dragCounter.current === 1) {
      setIsFileDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
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
