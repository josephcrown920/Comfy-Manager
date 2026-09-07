import React, { useRef, useState } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Loader2, UploadCloud, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "./progress";

const MB = 1024 * 1024;
const FILE_SIZE_LIMITS = {
  image: 20 * MB,
  audio: 100 * MB,
  video: 250 * MB,
  other: 20 * MB,
} as const;

interface FileUploadProps {
  accept?: string;
  onFileSelect: (filename: string) => void;
  label?: string;
  description?: string;
  previouslyUploadedName?: string;
}

function fileSizeLimit(file: File): { bytes: number; label: string } {
  if (file.type.startsWith("image/")) {
    return { bytes: FILE_SIZE_LIMITS.image, label: "Images" };
  }
  if (file.type.startsWith("audio/")) {
    return { bytes: FILE_SIZE_LIMITS.audio, label: "Audio files" };
  }
  if (file.type.startsWith("video/")) {
    return { bytes: FILE_SIZE_LIMITS.video, label: "Videos" };
  }
  return { bytes: FILE_SIZE_LIMITS.other, label: "Files" };
}

function acceptedSizeDescription(accept?: string): string {
  if (!accept) return "Maximum size: images 20 MB, audio 100 MB, video 250 MB.";

  const normalized = accept.toLowerCase();
  const limits: string[] = [];
  if (normalized.includes("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic)\b/.test(normalized)) {
    limits.push("images 20 MB");
  }
  if (normalized.includes("audio/") || /\.(mp3|wav|flac|aac|m4a|ogg|opus)\b/.test(normalized)) {
    limits.push("audio 100 MB");
  }
  if (normalized.includes("video/") || /\.(mp4|mov|webm|mkv|avi|m4v)\b/.test(normalized)) {
    limits.push("video 250 MB");
  }

  return limits.length > 0
    ? `Maximum size: ${limits.join(", ")}.`
    : "Maximum file size: 20 MB.";
}

export function FileUpload({
  accept,
  onFileSelect,
  label,
  description,
  previouslyUploadedName,
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedName, setUploadedName] = useState<string>(previouslyUploadedName ?? "");
  const [isPreviouslyUploaded, setIsPreviouslyUploaded] = useState(Boolean(previouslyUploadedName));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    if (!previouslyUploadedName) return;

    setUploadedName(previouslyUploadedName ?? "");
    setIsPreviouslyUploaded(true);
  }, [previouslyUploadedName]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeLimit = fileSizeLimit(file);
    if (file.size > sizeLimit.bytes) {
      toast({
        title: "File too large",
        description: `${sizeLimit.label} must be ${sizeLimit.bytes / MB} MB or smaller.`,
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setUploadedName("");
    setIsPreviouslyUploaded(false);

    try {
      const comfyName = await uploadFile(file, (pct) => setProgress(pct), accept);
      setUploadedName(comfyName);
      onFileSelect(comfyName);
      toast({ title: "File uploaded", description: `Stored as: ${comfyName}` });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message ?? "Unknown error",
        variant: "destructive",
      });
      // Reset the input so the user can retry the same file
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {label && <Label>{label}</Label>}
      <div className="flex flex-col gap-2">
        <Input
          type="file"
          className="hidden"
          ref={fileInputRef}
          accept={accept}
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full h-24 border-dashed bg-muted/20 hover:bg-muted/50 flex flex-col gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : uploadedName ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <UploadCloud className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="text-muted-foreground text-sm font-normal">
            {isUploading
              ? `Uploading… ${progress}%`
              : uploadedName
                ? isPreviouslyUploaded
                  ? `Previously uploaded: ${uploadedName}`
                  : `Uploaded: ${uploadedName}`
                : "Click to upload a file"}
          </span>
        </Button>

        {isUploading && (
          <Progress value={progress} className="h-1.5" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {[description, acceptedSizeDescription(accept)].filter(Boolean).join(" ")}
      </p>
    </div>
  );
}

/**
 * Upload a file to the API server's /api/files/upload endpoint.
 * Uses XMLHttpRequest so we get upload-progress events.
 * Returns the filename that ComfyUI assigned.
 */
export function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
  accept?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText) as { name: string };
          resolve(json.name);
        } catch {
          reject(new Error("Invalid response from upload endpoint"));
        }
      } else {
        let message = `Upload failed (${xhr.status})`;
        try {
          const json = JSON.parse(xhr.responseText) as { error?: string };
          if (json.error) message = json.error;
        } catch { /* ignore */ }
        reject(new Error(message));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    const url = accept
      ? `/api/files/upload?accept=${encodeURIComponent(accept)}`
      : "/api/files/upload";
    xhr.open("POST", url);
    xhr.send(formData);
  });
}
