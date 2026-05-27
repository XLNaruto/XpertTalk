import React, { useCallback, useEffect, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiHeader, postData } from "@/lib/api-helper";
import { cn } from "@/lib/utils";

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileUrl: string;
  userName: string;
  onProfileChanged?: () => void;
}

export function UserProfileDialog({
  open,
  onOpenChange,
  profileUrl,
  userName,
  onProfileChanged,
}: UserProfileDialogProps) {
  const [localProfileUrl, setLocalProfileUrl] = useState(profileUrl);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setLocalProfileUrl(profileUrl);
  }, [profileUrl]);

  const uploadProfile = async (croppedFile: File) => {
    const param = new FormData();
    param.append("profilePicture", croppedFile);

    const response: any = await postData(
      "auth/profilePicture",
      param,
      apiHeader(true, 0)
    );

    if (
      String(response?.status) === "200" &&
      String(response?.data.status) === "200"
    ) {
      toast.success("Profile photo updated");
      onProfileChanged?.();
    } else {
      toast.error("Failed to update profile photo");
    }
  };

  const handleImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
        toast.error("Please upload a valid image (PNG, JPG, JPEG)");
        return;
      }

      setIsLoading(true);
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setIsLoading(false);
          return;
        }

        // Square center crop
        const size = Math.min(img.width, img.height);
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(
          img,
          (img.width - size) / 2,
          (img.height - size) / 2,
          size,
          size,
          0,
          0,
          size,
          size
        );

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const croppedFile = new File([blob], file.name, {
                type: file.type,
              });
              setLocalProfileUrl(URL.createObjectURL(croppedFile));
              uploadProfile(croppedFile);
            }
            URL.revokeObjectURL(objectUrl);
            setIsLoading(false);
          },
          file.type
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setIsLoading(false);
        toast.error("Failed to process image");
      };

      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [onProfileChanged]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl border-border/50 bg-popover p-0">
        <DialogHeader className="border-b border-border/30 px-5 py-4">
          <DialogTitle className="text-base font-semibold text-foreground">
            Change Profile Photo
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 px-5 py-6">
          {/* Avatar with camera overlay */}
          <label className="group relative cursor-pointer">
            <input
              type="file"
              accept=".png,.jpg,.jpeg"
              className="hidden"
              onChange={handleImageChange}
              disabled={isLoading}
            />
            {isLoading ? (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                  {localProfileUrl ? (
                    <img
                      src={localProfileUrl}
                      alt={userName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-semibold text-primary">
                      {userName
                        ?.split(" ")
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2) || "?"}
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "absolute inset-0 flex items-center justify-center rounded-full",
                    "bg-background/60 opacity-0 backdrop-blur-sm transition-opacity",
                    "group-hover:opacity-100"
                  )}
                >
                  <Camera className="h-6 w-6 text-foreground" />
                </div>
              </>
            )}
          </label>

          <p className="text-xs text-muted-foreground">
            Preferred size 1:1 ratio. Click to upload.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
