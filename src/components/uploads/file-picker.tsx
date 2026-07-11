"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  FileUp,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  MAX_FILE_SIZE,
  paymentTypes,
  supportTypes,
} from "@/lib/validation/application";

export type UploadStatus = "ready" | "uploading" | "uploaded" | "failed";
export type SelectedUpload = {
  id: string;
  file: File;
  kind: "supporting_document" | "payment_proof";
  status: UploadStatus;
  progress: number;
  error?: string;
};

export function FilePicker({
  kind,
  files,
  onChange,
  error,
  disabled = false,
  onRetry,
}: {
  kind: SelectedUpload["kind"];
  files: SelectedUpload[];
  onChange: (files: SelectedUpload[]) => void;
  error?: string;
  disabled?: boolean;
  onRetry?: () => void;
}) {
  const maxFiles = kind === "supporting_document" ? 5 : 1;
  const onDrop = useCallback(
    (accepted: File[]) =>
      onChange([
        ...files,
        ...accepted.slice(0, maxFiles - files.length).map((file) => ({
          id: crypto.randomUUID(),
          file,
          kind,
          status: "ready" as const,
          progress: 0,
        })),
      ]),
    [files, kind, maxFiles, onChange],
  );
  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      maxFiles,
      maxSize: MAX_FILE_SIZE,
      accept: Object.fromEntries(
        (kind === "payment_proof" ? paymentTypes : supportTypes).map((type) => [
          type,
          [],
        ]),
      ),
      disabled: disabled || files.length >= maxFiles,
    });
  const rejection =
    fileRejections[0]?.errors[0]?.code === "file-too-large"
      ? "Each file must be 5 MB or smaller."
      : fileRejections[0]?.errors[0]?.message;
  return (
    <div className="flex flex-col gap-3">
      <div
        {...getRootProps()}
        className={cn(
          "flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-mist-strong bg-white px-5 py-5 text-center transition-colors hover:border-champagne",
          isDragActive && "border-champagne bg-gold-wash",
          (disabled || files.length >= maxFiles) &&
            "cursor-not-allowed opacity-60",
          error && "border-destructive",
        )}
      >
        <input
          {...getInputProps()}
          aria-label={
            kind === "payment_proof"
              ? "Choose payment proof"
              : "Choose supporting documents"
          }
        />
        <FileUp className="mb-2 text-antique-gold" aria-hidden />
        <p className="text-sm font-medium">
          Drop {maxFiles === 1 ? "a file" : "files"} here or{" "}
          <span className="text-antique-gold underline">browse</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {kind === "payment_proof"
            ? "PDF, JPEG, PNG or WebP"
            : "PDF, DOC, DOCX, JPEG, PNG or WebP"}{" "}
          · 5 MB maximum
        </p>
      </div>
      <div aria-live="polite" className="flex flex-col gap-3">
        {files.map((upload) => (
          <div
            key={upload.id}
            className={cn(
              "rounded-md border bg-white px-4 py-3",
              upload.status === "failed" && "border-destructive/60",
            )}
          >
            <div className="flex items-center gap-3">
              {upload.status === "uploading" ? (
                <LoaderCircle
                  className="animate-spin text-antique-gold"
                  aria-hidden
                />
              ) : upload.status === "uploaded" ? (
                <CheckCircle2 className="text-[#23604e]" aria-hidden />
              ) : upload.status === "failed" ? (
                <AlertCircle className="text-destructive" aria-hidden />
              ) : (
                <FileCheck2 className="text-[#23604e]" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {upload.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(upload.file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                  {upload.status === "ready"
                    ? "Ready to upload"
                    : upload.status === "uploading"
                      ? `Uploading ${upload.progress}%`
                      : upload.status === "uploaded"
                        ? "Uploaded securely"
                        : upload.error || "Upload failed"}
                </p>
              </div>
              {upload.status === "failed" && onRetry ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Retry ${upload.file.name}`}
                  onClick={onRetry}
                >
                  <RotateCcw />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                aria-label={`Remove ${upload.file.name}`}
                onClick={() =>
                  onChange(files.filter((file) => file.id !== upload.id))
                }
              >
                <Trash2 />
              </Button>
            </div>
            {upload.status === "uploading" ? (
              <Progress
                value={upload.progress}
                className="mt-3 h-1.5"
                aria-label={`${upload.file.name} upload progress`}
              />
            ) : null}
          </div>
        ))}
      </div>
      {error || rejection ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? rejection}
        </p>
      ) : null}
    </div>
  );
}
