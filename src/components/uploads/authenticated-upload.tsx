"use client";
import { useState } from "react";
import { FileUp, LoaderCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
export function AuthenticatedUpload({
  applicationId,
  kind,
  onComplete,
}: {
  applicationId: string;
  kind: "requested_document" | "payment_proof";
  onComplete?: () => void;
}) {
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"idle" | "uploading" | "complete">("idle");
  const [error, setError] = useState("");
  async function upload() {
    if (!file) return;
    setError("");
    setState("uploading");
    try {
      const endpoint =
        kind === "requested_document"
          ? "/api/uploads/requested-document"
          : "/api/uploads/application";
      const presign = await fetch(`${endpoint}/presign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicationId,
          kind,
          name: file.name,
          size: file.size,
          type: file.type,
        }),
      });
      const intent = await presign.json();
      if (!intent.ok) throw new Error(intent.message);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", intent.data.url);
        Object.entries(intent.data.headers as Record<string, string>).forEach(
          ([key, value]) => xhr.setRequestHeader(key, value),
        );
        xhr.upload.onprogress = (event) =>
          event.lengthComputable &&
          setProgress(Math.round((event.loaded / event.total) * 100));
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error("The file transfer failed."));
        xhr.onerror = () => reject(new Error("The upload was interrupted."));
        xhr.send(file);
      });
      const complete = await fetch(`${endpoint}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId, fileId: intent.data.fileId }),
      });
      const result = await complete.json();
      if (!result.ok) throw new Error(result.message);
      setState("complete");
      setProgress(100);
      onComplete?.();
    } catch (reason) {
      setState("idle");
      setError(reason instanceof Error ? reason.message : "The upload failed.");
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed bg-white p-5 text-center">
        <FileUp className="mb-2 text-antique-gold" />
        <span className="text-sm font-medium">
          {file ? file.name : "Choose a secure file"}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">
          {kind === "requested_document"
            ? "PDF, DOC, DOCX, JPEG, PNG or WebP"
            : "PDF, JPEG, PNG or WebP"}{" "}
          · 5 MB maximum
        </span>
        <input
          type="file"
          className="sr-only"
          accept={
            kind === "payment_proof"
              ? "application/pdf,image/jpeg,image/png,image/webp"
              : "application/pdf,.doc,.docx,image/jpeg,image/png,image/webp"
          }
          onChange={(event) => setFile(event.target.files?.[0])}
        />
      </label>
      {state === "uploading" ? <Progress value={progress} /> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        onClick={upload}
        disabled={!file || state !== "idle"}
      >
        {state === "uploading" ? (
          <LoaderCircle className="animate-spin" data-icon="inline-start" />
        ) : state === "complete" ? (
          <CheckCircle2 data-icon="inline-start" />
        ) : (
          <FileUp data-icon="inline-start" />
        )}
        {state === "complete" ? "Upload complete" : "Upload and verify"}
      </Button>
    </div>
  );
}
