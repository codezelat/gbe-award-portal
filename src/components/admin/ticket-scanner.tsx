"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import {
  Camera,
  CircleAlert,
  CheckCircle2,
  ImageUp,
  LoaderCircle,
  ScanLine,
  XCircle,
} from "lucide-react";
import type { IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  admitGuestTicket,
  readGuestTicketForScan,
} from "@/server/actions/ticket-actions";
import type { TicketAdmission } from "@/server/services/tickets";
import { ticketIdFromQr } from "@/lib/domain/ticket-return";
import { TicketGuestDetails } from "@/components/admin/ticket-guest-details";

export function TicketScanner() {
  const video = useRef<HTMLVideoElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const lock = useRef(false);
  const [camera, setCamera] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState<TicketAdmission | null>(null);
  const [admitted, setAdmitted] = useState(false);

  const stop = useCallback(() => {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream)
      stream.getTracks().forEach((track) => track.stop());
    if (video.current) video.current.srcObject = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const pause = () => {
      if (document.hidden) {
        stop();
        setCamera(false);
        setStarting(false);
      }
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      mounted.current = false;
      stop();
      document.removeEventListener("visibilitychange", pause);
    };
  }, [stop]);

  async function inspect(value: string) {
    if (lock.current) return;
    lock.current = true;
    stop();
    setCamera(false);
    setStarting(false);
    setError("");
    setTicket(null);
    setAdmitted(false);
    const id = ticketIdFromQr(value, window.location.origin);
    if (!id) {
      setError(
        "This is not a guest ticket for this portal. Scan the QR on the ticket.",
      );
      lock.current = false;
      return;
    }
    setBusy(true);
    setOpen(true);
    try {
      const result = await readGuestTicketForScan(id);
      if (!mounted.current) return;
      if (result.ok) setTicket(result.ticket);
      else setError(result.message);
    } catch {
      if (mounted.current)
        setError(
          "Could not check this ticket. Check your connection and scan again.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function start() {
    if (lock.current) return;
    stop();
    const version = generation.current;
    setOpen(false);
    setError("");
    setStarting(true);
    setCamera(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (!mounted.current || version !== generation.current) return;
      const scanner = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 200,
        delayBetweenScanSuccess: 1000,
      });
      const active = await scanner.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
          },
        },
        video.current!,
        (result) => {
          if (result && version === generation.current)
            void inspect(result.getText());
        },
      );
      if (!mounted.current || version !== generation.current) active.stop();
      else controls.current = active;
    } catch (cause) {
      if (!mounted.current || version !== generation.current) return;
      stop();
      setCamera(false);
      setError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Allow camera access in your browser, or scan a ticket screenshot."
          : "Camera unavailable. Try again or scan a ticket screenshot.",
      );
    } finally {
      if (mounted.current) setStarting(false);
    }
  }

  async function scanImage(file: File | undefined) {
    if (!file || lock.current) return;
    stop();
    setCamera(false);
    setError("");
    if (
      file.size > 5 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setError("Choose a JPG, PNG or WebP screenshot up to 5 MB.");
      return;
    }
    lock.current = true;
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(url);
      lock.current = false;
      if (mounted.current) await inspect(result.getText());
    } catch {
      if (mounted.current)
        setError(
          "No QR found. Choose a clear screenshot showing the whole QR code.",
        );
    } finally {
      URL.revokeObjectURL(url);
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function admit() {
    if (!ticket || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await admitGuestTicket(ticket.id);
      if (!mounted.current) return;
      if (result.ok) {
        setAdmitted(true);
        setTicket({
          ...ticket,
          status: "used",
          checkedInAt: new Date().toISOString(),
        });
      } else setError(result.message);
      const fresh = await readGuestTicketForScan(ticket.id).catch(() => null);
      if (mounted.current && fresh?.ok) setTicket(fresh.ticket);
    } catch {
      if (mounted.current)
        setError(
          "Confirmation could not be received. Check the connection and scan again before admitting this guest.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <>
      <section className="mx-auto w-full max-w-lg rounded-2xl border bg-card p-5 sm:p-6">
        <div className="relative aspect-[4/3] max-h-[45dvh] w-full overflow-hidden rounded-xl bg-muted sm:aspect-square">
          <video
            ref={video}
            muted
            playsInline
            aria-label="Ticket scanning camera"
            className={`size-full object-cover ${camera ? "" : "invisible"}`}
          />
          {!camera && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground">
              <ScanLine aria-hidden className="size-16 stroke-1" />
              <p className="text-sm">Scan a guest ticket</p>
            </div>
          )}
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <LoaderCircle
                aria-label="Starting camera"
                className="size-7 animate-spin"
              />
            </div>
          )}
          {camera && !starting && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80"
            />
          )}
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {camera ? (
            <Button
              className="min-h-12 shrink-0 sm:flex-1"
              variant="outline"
              onClick={() => {
                stop();
                setCamera(false);
                setStarting(false);
              }}
            >
              Stop camera
            </Button>
          ) : (
            <Button
              className="min-h-12 shrink-0 sm:flex-1"
              disabled={busy}
              onClick={() => void start()}
            >
              <Camera aria-hidden />
              Start camera
            </Button>
          )}
          <Button
            variant="outline"
            className="min-h-12 shrink-0 sm:flex-1"
            disabled={busy || starting}
            onClick={() => upload.current?.click()}
          >
            {busy && !open ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <ImageUp aria-hidden />
            )}
            Scan screenshot
          </Button>
          <input
            ref={upload}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            aria-label="Ticket screenshot"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void scanImage(file);
            }}
          />
        </div>
        {error && !open && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
            if (!value) setError("");
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {!ticket
                ? busy
                  ? "Checking ticket"
                  : "Ticket unavailable"
                : ticket.status === "invalid"
                  ? "Ticket not valid"
                  : ticket.status === "used"
                    ? admitted
                      ? "Checked in"
                      : "Already checked in"
                    : "Guest check-in"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirm the guest before admitting them.
            </DialogDescription>
          </DialogHeader>
          {!ticket && busy && (
            <LoaderCircle
              aria-label="Checking ticket"
              className="mx-auto my-6 size-8 animate-spin"
            />
          )}
          {ticket && (
            <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
              {ticket.status === "invalid" ? (
                <XCircle aria-hidden className="size-9 text-destructive" />
              ) : ticket.status === "used" ? (
                admitted ? (
                  <CheckCircle2 aria-hidden className="size-9 text-primary" />
                ) : (
                  <CircleAlert aria-hidden className="size-9 text-amber-700" />
                )
              ) : null}
              <TicketGuestDetails ticket={ticket} />
              {ticket.status === "used" && ticket.checkedInAt && (
                <p className="text-sm text-muted-foreground">
                  Checked in{" "}
                  {formatInTimeZone(
                    ticket.checkedInAt,
                    "Asia/Colombo",
                    "d MMM, h:mm a",
                  )}
                </p>
              )}
              {ticket.status === "invalid" && (
                <p className="text-sm text-destructive">
                  Do not admit. This ticket is cancelled or no longer valid.
                </p>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {ticket?.status === "valid" && (
              <Button
                className="h-12 min-h-12"
                disabled={busy}
                onClick={() => void admit()}
              >
                {busy && <LoaderCircle aria-hidden className="animate-spin" />}
                Confirm check-in
              </Button>
            )}
            <Button
              className="h-12 min-h-12"
              variant={ticket?.status === "used" ? "default" : "outline"}
              disabled={busy}
              onClick={() => void start()}
            >
              <ScanLine aria-hidden />
              Scan next
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
