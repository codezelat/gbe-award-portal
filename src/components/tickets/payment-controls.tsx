"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { TicketCountdown } from "./countdown";
export function TicketPaymentControls({
  id,
  canPay,
  autoCheck = false,
  deadline,
  serverNow,
}: {
  id: string;
  canPay: boolean;
  autoCheck?: boolean;
  deadline: number;
  serverNow: number;
}) {
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState<string | null>(autoCheck ? "check" : null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!autoCheck) return;
    const controller = new AbortController();
    lock.current = true;
    fetch(`/api/public/tickets/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check" }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.message ?? "Please check payment again shortly.",
          );
        router.refresh();
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Please check payment again shortly.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          lock.current = false;
          setBusy(null);
        }
      });
    return () => controller.abort();
  }, [autoCheck, id, router]);
  const run = useCallback(
    async (action: "checkout" | "check") => {
      if (lock.current) return;
      lock.current = true;
      setBusy(action);
      setError("");
      try {
        const response = await fetch(`/api/public/tickets/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message ?? "Please try again.");
        if (result.url) {
          window.location.assign(result.url);
          return;
        }
        router.refresh();
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Could not connect. Please retry.",
        );
      } finally {
        lock.current = false;
        setBusy(null);
      }
    },
    [id, router],
  );
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    // One expiry check, not recurring gateway polling. Webhooks and the daily
    // dispatcher handle abandoned checkouts without keeping a browser open.
    const delay = deadline - Date.now();
    const timeout =
      delay > 0 ? setTimeout(() => void run("check"), delay + 500) : null;
    return () => {
      clearInterval(clock);
      if (timeout) clearTimeout(timeout);
    };
  }, [deadline, run]);
  return (
    <div className="mt-6 flex flex-col gap-3">
      <TicketCountdown
        deadline={deadline}
        now={now}
        label="Complete payment in"
        expiredLabel="Payment being checked"
      />
      {canPay && now < deadline && (
        <Button
          variant="payment"
          className="h-14 min-h-14 gap-3 rounded-xl px-5"
          loading={busy === "checkout"}
          loadingLabel="Opening checkout"
          disabled={!!busy}
          onClick={() => run("checkout")}
        >
          Pay securely by card
          <ArrowRight aria-hidden data-icon="inline-end" />
        </Button>
      )}
      <Button
        className="h-12 min-h-12"
        variant="outline"
        disabled={!!busy}
        onClick={() => run("check")}
      >
        {busy === "check" && (
          <LoaderCircle aria-hidden className="animate-spin" />
        )}
        Check payment status
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
