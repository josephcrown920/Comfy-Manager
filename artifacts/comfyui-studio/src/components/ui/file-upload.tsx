import React, { useRef, useState } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Loader2, UploadCloud, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "./progress";

interface FileUploadProps {
  accept?: string;
  onFileSelect: (filename: string) => void;
  label?: string;
  description?: string;
}

export function FileUpload({ accept, onFileSelect, label, description }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedName, setUploadedName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setProgress(0);
    setUploadedName("");

    try {
      const comfyName = await uploadFile(file, (pct) => setProgress(pct));
      setUploadedName(file.name);
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
                ? `Uploaded: ${uploadedName}`
                : "Click to upload a file"}
          </span>
        </Button>

        {isUploading && (
          <Progress value={progress} className="h-1.5" />
        )}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

/**
 * Upload a file to the API server's /api/files/upload endpoint.
 * Uses XMLHttpRequest so we get upload-progress events.
 * Returns the filename that ComfyUI assigned.
 */
function uploadFile(file: File, onProgress: (pct: number) => void): Promise<string> {
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

    xhr.open("POST", "/api/files/upload");
    xhr.send(formData);
  });
}
