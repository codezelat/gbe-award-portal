"use client";

import { useEffect, useState } from "react";
import { Download, Eye, FileWarning, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PdfDocumentPreview } from "@/components/admin/pdf-document-preview";

export function ProtectedFilePreview({
  fileId,
  fileName,
  className,
}: {
  fileId: string;
  fileName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{
    blob: Blob;
    type: string;
    url?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = `/api/files/${fileId}/download?view=1`;
  const downloadUrl = `/api/files/${fileId}/download`;

  function handleOpenChange(nextOpen: boolean) {
    setPreview(null);
    setError(null);
    setOpen(nextOpen);
  }

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    let active = true;
    let objectUrl: string | null = null;

    void fetch(previewUrl, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("PREVIEW_REQUEST_FAILED");
        const blob = await response.blob();
        if (
          blob.type !== "application/pdf" &&
          !blob.type.startsWith("image/")
        )
          throw new Error("PREVIEW_TYPE_UNSUPPORTED");
        if (!active) return;
        if (blob.type.startsWith("image/"))
          objectUrl = URL.createObjectURL(blob);
        setPreview({
          blob,
          type: blob.type,
          url: objectUrl ?? undefined,
        });
      })
      .catch((cause: unknown) => {
        if (
          cause instanceof DOMException &&
          cause.name === "AbortError"
        )
          return;
        setError(
          "This file could not be previewed safely. You can still download it.",
        );
      });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, previewUrl]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={className}
          />
        }
      >
        <Eye data-icon="inline-start" />
        Preview
      </DialogTrigger>
      <DialogContent
        className="w-[calc(100%-1rem)] max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl"
        showCloseButton={false}
      >
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <DialogTitle className="truncate">{fileName}</DialogTitle>
          <DialogDescription className="sr-only">
            Secure file preview
          </DialogDescription>
        </DialogHeader>
        <div className="flex h-[min(72svh,42rem)] min-h-72 items-center justify-center bg-muted">
          {preview?.type === "application/pdf" ? (
            <PdfDocumentPreview
              blob={preview.blob}
              fileName={fileName}
            />
          ) : preview?.type.startsWith("image/") && preview.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- Blob URLs are short-lived authenticated previews.
            <img
              alt={`Preview of ${fileName}`}
              className="max-h-full max-w-full object-contain"
              src={preview.url}
            />
          ) : error ? (
            <div
              className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 text-center"
              role="alert"
            >
              <FileWarning className="size-7 text-amber-700" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <LoaderCircle className="size-4 animate-spin" />
              Preparing secure preview…
            </div>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-none">
          <DialogClose render={<Button type="button" variant="outline" />}>
            Close
          </DialogClose>
          <Button type="button" render={<a download href={downloadUrl} />}>
            <Download data-icon="inline-start" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
