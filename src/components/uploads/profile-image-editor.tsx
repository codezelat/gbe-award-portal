"use client";
import { useState } from "react";
import Image from "next/image";
import Cropper, { type Area } from "react-easy-crop";
import { Camera, CheckCircle2, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export function ProfileImageEditor({
  accountKind,
  currentUrl,
}: {
  accountKind: "applicant" | "staff";
  currentUrl?: string;
}) {
  const [file, setFile] = useState<File>();
  const [source, setSource] = useState<string>();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area>();
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"idle" | "uploading" | "complete">("idle");
  const [error, setError] = useState("");
  function chooseFile(next?: File) {
    if (source) URL.revokeObjectURL(source);
    setFile(next);
    setSource(next ? URL.createObjectURL(next) : undefined);
  }
  async function save() {
    if (!file || !pixels) return;
    setState("uploading");
    setError("");
    try {
      const presign = await fetch("/api/uploads/profile/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
            : reject(new Error("The image transfer failed."));
        xhr.onerror = () =>
          reject(new Error("The image upload was interrupted."));
        xhr.send(file);
      });
      const complete = await fetch("/api/uploads/profile/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileId: intent.data.fileId, crop: pixels }),
      });
      const result = await complete.json();
      if (!result.ok) throw new Error(result.message);
      setState("complete");
      setProgress(100);
      window.location.reload();
    } catch (reason) {
      setState("idle");
      setError(
        reason instanceof Error
          ? reason.message
          : "The image could not be saved.",
      );
    }
  }
  async function remove() {
    if (!window.confirm("Remove the current profile image?")) return;
    const response = await fetch("/api/uploads/profile", { method: "DELETE" });
    const result = await response.json();
    if (!result.ok) { setError(result.message); return; }
    window.location.reload();
  }
  return (
    <div className="flex flex-col gap-4">
      <div
        className={`relative aspect-square overflow-hidden bg-muted ${accountKind === "applicant" ? "rounded-full" : "rounded-xl"}`}
      >
        {source ? (
          <Cropper
            image={source}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape={accountKind === "applicant" ? "round" : "rect"}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, area) => setPixels(area)}
          />
        ) : currentUrl ? (
          <Image
            src={currentUrl}
            alt="Current profile"
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <Camera className="size-12" />
          </div>
        )}
      </div>
      <label className="flex h-11 cursor-pointer items-center justify-center rounded-md border bg-white text-sm font-medium hover:bg-muted">
        <Camera className="mr-2" />
        Choose JPEG, PNG or WebP
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
            onChange={(event) => chooseFile(event.target.files?.[0])}
        />
      </label>
      {source ? (
        <label className="flex items-center gap-3 text-sm">
          Zoom
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="flex-1"
          />
        </label>
      ) : null}
      {state === "uploading" ? <Progress value={progress} /> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        onClick={save}
        disabled={!file || !pixels || state !== "idle"}
      >
        {state === "uploading" ? (
          <LoaderCircle className="animate-spin" data-icon="inline-start" />
        ) : state === "complete" ? (
          <CheckCircle2 data-icon="inline-start" />
        ) : (
          <Camera data-icon="inline-start" />
        )}
        Save cropped image
      </Button>
      {currentUrl ? (
        <Button type="button" variant="outline" onClick={remove}>
          <Trash2 data-icon="inline-start" />
          Remove current image
        </Button>
      ) : null}
    </div>
  );
}
