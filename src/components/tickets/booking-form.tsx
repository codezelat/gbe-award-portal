"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field";
import { Turnstile } from "@/components/forms/turnstile";
import { ticketContactSchema, ticketMoney } from "@/lib/domain/tickets";
import { TicketCountdown } from "./countdown";
export function TicketBookingForm({
  sale,
  quantity,
  detailsSession,
}: {
  sale: { id: string; price: number; currency: string; maximum: number };
  quantity: number;
  detailsSession: { now: number; expiresAt: number; signature: string };
}) {
  const router = useRouter();
  const [now, setNow] = useState(detailsSession.now);
  const [refreshing, startRefresh] = useTransition();
  const expired = now >= detailsSession.expiresAt;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [reset, setReset] = useState(0);
  const lock = useRef(false);
  const request = useRef<{
    id: string;
    secret: string;
    payload: string;
  } | null>(null);
  return (
    <form
      className="min-w-0 rounded-2xl border bg-card p-3 shadow-sm min-[375px]:p-4 sm:p-7"
      onSubmit={async (event) => {
        event.preventDefault();
        if (lock.current) return;
        if (Date.now() >= detailsSession.expiresAt) {
          setNow(Date.now());
          return;
        }
        const data = new FormData(event.currentTarget);
        const parsed = ticketContactSchema.safeParse({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          businessName: data.get("businessName"),
          quantity,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Check your details.");
          return;
        }
        if (!token) {
          setError("Complete the security verification.");
          return;
        }
        const payload = JSON.stringify(parsed.data);
        if (request.current && request.current.payload !== payload) {
          setError(
            "Your earlier payment request may still be active. Retry with the original details. Do not pay again if your card was charged.",
          );
          return;
        }
        request.current ??= {
          id: crypto.randomUUID(),
          secret: Array.from(
            crypto.getRandomValues(new Uint8Array(32)),
            (byte) => byte.toString(16).padStart(2, "0"),
          ).join(""),
          payload,
        };
        lock.current = true;
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/public/tickets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...parsed.data,
              id: request.current.id,
              secret: request.current.secret,
              salesId: sale.id,
              acceptedUnitPriceMinor: sale.price,
              turnstileToken: token,
              detailsExpiresAt: detailsSession.expiresAt,
              detailsSignature: detailsSession.signature,
            }),
          });
          const result = await response.json();
          if (!response.ok || !result.url) {
            if (response.status === 400) request.current = null;
            throw new Error(result.message ?? "Please try again.");
          }
          if (result.url.startsWith("https://"))
            window.location.assign(result.url);
          else router.push(result.url);
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Could not connect. Please try again.",
          );
          setToken("");
          setReset((value) => value + 1);
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <TicketCountdown
        deadline={detailsSession.expiresAt}
        now={now}
        label="Complete details in"
        expiredLabel="Details session expired"
      />
      {expired && (
        <Button
          type="button"
          variant="outline"
          className="mb-5 h-12 min-h-12 w-full"
          disabled={refreshing || busy}
          onClick={() => startRefresh(() => router.refresh())}
        >
          {refreshing && <LoaderCircle aria-hidden className="animate-spin" />}
          Refresh availability
        </Button>
      )}
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-5">
        <Field>
          <FieldLabel htmlFor="ticket-name">Full name</FieldLabel>
          <Input
            id="ticket-name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={160}
            className="h-12 min-h-12"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ticket-phone">Contact number</FieldLabel>
          <Input
            id="ticket-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            maxLength={40}
            placeholder="+94"
            className="h-12 min-h-12"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ticket-email">Email</FieldLabel>
          <Input
            id="ticket-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            className="h-12 min-h-12"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ticket-business">Business name</FieldLabel>
          <Input
            id="ticket-business"
            name="businessName"
            autoComplete="organization"
            aria-describedby="ticket-business-hint"
            maxLength={200}
            className="h-12 min-h-12"
          />
          <FieldDescription id="ticket-business-hint">
            If you’re booking for a business.
          </FieldDescription>
        </Field>
        <div className="flex justify-between gap-3 border-t pt-5">
          <span className="text-sm">
            {quantity} {quantity === 1 ? "guest" : "guests"}
          </span>
          <strong className="text-xl tabular-nums">
            {ticketMoney(sale.price * quantity, sale.currency)}
          </strong>
        </div>
        <Turnstile
          action="gbe_ticket_booking"
          onToken={setToken}
          resetSignal={reset}
          responsive
        />
        <FieldError>{error}</FieldError>
        <Button
          type="submit"
          variant="payment"
          className="h-14 min-h-14 w-full gap-3 rounded-xl px-5"
          loading={busy}
          loadingLabel="Opening checkout"
          disabled={busy || !token || expired || refreshing}
        >
          Pay securely by card
          <ArrowRight aria-hidden data-icon="inline-end" />
        </Button>
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck aria-hidden className="size-4" />
          Secure card checkout with Genie
        </p>
      </fieldset>
    </form>
  );
}
