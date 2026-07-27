import React, { useEffect, useState } from "react";
import { X, FileText, Image as ImageIcon } from "lucide-react";

// Browsers (except Safari) can't render HEIC/HEIF in an <img>, so an object URL
// for one just yields a broken thumbnail. The backend converts these on upload;
// here we show a generic image icon instead. HEIC often reports an empty MIME
// type, so match the extension too.
const HEIC_RE = /\.(heic|heif)$/i;

function isRenderableImage(file: File): boolean {
  return (
    file.type !== "image/heic" &&
    file.type !== "image/heif" &&
    !HEIC_RE.test(file.name)
  );
}

interface FilePreviewProps {
  files: File[];
  onRemove: (index: number) => void;
  isImage: (file: File) => boolean;
}

export const FilePreview = React.memo(function FilePreview({
  files,
  onRemove,
  isImage,
}: FilePreviewProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex max-h-50 flex-wrap gap-2 overflow-y-auto px-4 pb-2 pt-3">
      {files.map((file, index) => (
        <FilePreviewItem
          key={`${file.name}-${index}`}
          file={file}
          index={index}
          onRemove={onRemove}
          isImageFile={isImage(file)}
        />
      ))}
    </div>
  );
});

const FilePreviewItem = React.memo(function FilePreviewItem({
  file,
  index,
  onRemove,
  isImageFile,
}: {
  file: File;
  index: number;
  onRemove: (index: number) => void;
  isImageFile: boolean;
}) {
  // HEIC/HEIF is an image but can't be painted — icon it instead of an <img>.
  const canRender = isImageFile && isRenderableImage(file);
  const isImageLike = isImageFile || HEIC_RE.test(file.name);
  const [renderFailed, setRenderFailed] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  // Create the URL inside the effect that revokes it, so the two always stay
  // paired — memoising it separately means StrictMode's double-invoke revokes
  // the URL the <img> is still pointing at, and every preview breaks.
  useEffect(() => {
    if (!canRender) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setRenderFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [file, canRender]);

  const Icon = isImageLike ? ImageIcon : FileText;

  return (
    <div className="group relative flex items-center gap-2 rounded-lg border border-border/30 bg-muted/50 p-2">
      {objectUrl && !renderFailed ? (
        <img
          src={objectUrl}
          alt={file.name}
          onError={() => setRenderFailed(true)}
          className="h-12 w-12 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      )}
      <span className="max-w-[80px] truncate text-xs text-muted-foreground">
        {file.name}
      </span>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
});
