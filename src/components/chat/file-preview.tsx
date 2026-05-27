import React, { useMemo } from "react";
import { X, FileText } from "lucide-react";

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
  const objectUrl = useMemo(
    () => (isImageFile ? URL.createObjectURL(file) : null),
    [file, isImageFile]
  );

  return (
    <div className="group relative flex items-center gap-2 rounded-lg border border-border/30 bg-muted/50 p-2">
      {isImageFile && objectUrl ? (
        <img
          src={objectUrl}
          alt={file.name}
          className="h-12 w-12 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
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
