import React, { useId, useRef, useState } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Loader2, UploadCloud, CheckCircle2, CircleAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "./progress";

const MB = 1024 * 1024;
const FILE_SIZE_LIMITS = {
  image: 20 * MB,
  audio: 100 * MB,
  video: 100 * MB,
  other: 20 * MB,
} as const;

export const IMAGE_FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif";

const IMAGE_FILE_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|heic|heif)$/i;

interface FileUploadProps {
  accept?: string;
  onFileSelect: (filename: string) => void;
  label?: string;
  description?: string;
  previouslyUploadedName?: string;
  preview?: boolean;
  previewPoster?: string;
}

function fileSizeLimit(file: File): { bytes: number; label: string } {
  if (file.type.startsWith("image/") || IMAGE_FILE_EXTENSIONS.test(file.name)) {
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
  if (!accept) return "Maximum size: images 20 MB, audio 100 MB, video 100 MB.";

  const normalized = accept.toLowerCase();
  const limits: string[] = [];
  if (normalized.includes("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|heif)\b/.test(normalized)) {
    limits.push("images 20 MB");
  }
  if (normalized.includes("audio/") || /\.(mp3|wav|flac|aac|m4a|ogg|opus)\b/.test(normalized)) {
    limits.push("audio 100 MB");
  }
  if (normalized.includes("video/") || /\.(mp4|mov|webm|mkv|avi|m4v)\b/.test(normalized)) {
    limits.push("video 100 MB");
  }

  return limits.length > 0
    ? `Maximum size: ${limits.join(", ")}.`
    : "Maximum file size: 20 MB.";
}

function browserAccept(accept?: string): string | undefined {
  if (!accept) return undefined;
  return accept
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .flatMap((pattern) => pattern.toLowerCase() === "image/*" ? IMAGE_FILE_ACCEPT.split(",") : [pattern])
    .join(",");
}

export function isSupportedImageFile(file: Pick<File, "type" | "name">): boolean {
  return file.type.toLowerCase().startsWith("image/") || IMAGE_FILE_EXTENSIONS.test(file.name);
}

export function FileUpload({
  accept,
  onFileSelect,
  label,
  description,
  previouslyUploadedName,
  preview = false,
  previewPoster,
}: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedName, setUploadedName] = useState<string>(previouslyUploadedName ?? "");
  const [isPreviouslyUploaded, setIsPreviouslyUploaded] = useState(Boolean(previouslyUploadedName));
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileIsImage, setSelectedFileIsImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef("");
  const previousUploadedNamePropRef = useRef(previouslyUploadedName);
  const lastNotifiedUploadRef = useRef("");
  const statusId = useId();
  const progressStatusId = useId();
  const { toast } = useToast();

  React.useEffect(() => {
    if (previouslyUploadedName === previousUploadedNamePropRef.current) return;
    previousUploadedNamePropRef.current = previouslyUploadedName;
    if (previouslyUploadedName === lastNotifiedUploadRef.current) return;
    setUploadedName(previouslyUploadedName ?? "");
    setIsPreviouslyUploaded(Boolean(previouslyUploadedName));
    if (!previouslyUploadedName) {
      setSelectedFileName("");
      setSelectedFileIsImage(false);
    }
  }, [previouslyUploadedName]);

  React.useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previousName = uploadedName;
    const sizeLimit = fileSizeLimit(file);
    setErrorMessage("");
    if (file.size > sizeLimit.bytes) {
      toast({
        title: "File too large",
        description: `${sizeLimit.label} must be ${sizeLimit.bytes / MB} MB or smaller.`,
        variant: "destructive",
      });
      setSelectedFileName("");
      setSelectedFileIsImage(false);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
        setPreviewUrl("");
      }
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setUploadedName("");
    setIsPreviouslyUploaded(false);
    setSelectedFileName(file.name);
    const isImage = isSupportedImageFile(file);
    setSelectedFileIsImage(isImage);
    if ((preview || isImage) && typeof URL.createObjectURL === "function") {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = URL.createObjectURL(file);
      setPreviewUrl(previewUrlRef.current);
    }

    try {
      const comfyName = await uploadFile(file, (pct) => setProgress(pct), accept);
      setUploadedName(comfyName);
      setErrorMessage("");
      lastNotifiedUploadRef.current = comfyName;
      onFileSelect(comfyName);
      toast({ title: "File uploaded", description: `Stored as: ${comfyName}` });
    } catch (err: any) {
      const message = err?.message ?? "Unknown error";
      setUploadedName(previousName);
      setIsPreviouslyUploaded(Boolean(previousName));
      setSelectedFileName("");
      setSelectedFileIsImage(false);
      setErrorMessage(message);
      toast({
        title: "Upload failed",
        description: message,
        variant: "destructive",
      });
      // Reset the input so the user can retry the same file
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
        setPreviewUrl("");
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {label && <Label>{label}</Label>}
      <div className="flex flex-col gap-2">
        {preview && previewUrl && !selectedFileIsImage && (
          <div className="overflow-hidden rounded-xl border border-border bg-background">
            <video
              src={previewUrl}
              poster={previewPoster}
              controls
              muted
              playsInline
              preload="metadata"
              className="max-h-56 w-full object-cover"
              aria-label={`${label ?? "Uploaded"} preview`}
            />
          </div>
        )}
        <Input
          type="file"
          className="hidden"
          ref={fileInputRef}
          accept={browserAccept(accept)}
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full h-24 border-dashed bg-muted/20 hover:bg-muted/50 flex flex-col gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          aria-busy={isUploading}
          aria-describedby={`${statusId} ${progressStatusId}`}
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
          <>
            <Progress value={progress} className="h-1.5" />
            <p id={progressStatusId} role="status" aria-live="polite" className="sr-only">
              Uploading {selectedFileName || "file"}… {progress}%
            </p>
          </>
        )}
        {previewUrl && selectedFileIsImage && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-2">
            <img
              src={previewUrl}
              alt={selectedFileName ? `Selected image: ${selectedFileName}` : "Selected image preview"}
              className="h-14 w-14 rounded-lg object-cover"
            />
            <p className="min-w-0 truncate text-xs text-muted-foreground">{selectedFileName}</p>
          </div>
        )}
        {errorMessage && (
          <p
            id={statusId}
            role="alert"
            className="flex items-start gap-2 text-xs text-destructive"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage} Choose the file again to retry.</span>
          </p>
        )}
        {!errorMessage && !isUploading && uploadedName && selectedFileName && (
          <p
            id={statusId}
            role="status"
            aria-live="polite"
            className="text-xs text-muted-foreground"
          >
            Selected: <span className="font-medium text-foreground">{selectedFileName}</span>
          </p>
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
