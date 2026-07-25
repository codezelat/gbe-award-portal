"use client";

import { useState } from "react";
import { Download, Eye } from "lucide-react";
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
  const previewUrl = `/api/files/${fileId}/download?view=1`;
  const downloadUrl = `/api/files/${fileId}/download`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        <div className="bg-muted">
          {open ? (
            <iframe
              className="block h-[min(72svh,42rem)] min-h-72 w-full border-0 bg-white"
              referrerPolicy="no-referrer"
              sandbox=""
              src={previewUrl}
              title={`Preview of ${fileName}`}
            />
          ) : null}
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-none">
          <DialogClose render={<Button type="button" variant="outline" />}>
            Close
          </DialogClose>
          <Button
            type="button"
            render={<a href={downloadUrl} />}
          >
            <Download data-icon="inline-start" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
