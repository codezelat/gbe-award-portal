"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, Landmark, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_FILE_SIZE, paymentTypes } from "@/lib/validation/application";

type PaymentState = {
  status: string;
  method: string | null;
  receipt?: string | null;
  amountMinor: number;
  cardAmountMinor: number;
  attempt?: { state: string; active: boolean; expiresAt: string } | null;
};
type Bank = {
  accountName: string;
  bankName: string;
  accountNumber: string;
  branchName?: string;
};
export function NominationPayment({
  applicationId,
  reference,
  bankAmountMinor,
  currency,
  initial,
  bank,
  cardEnabled,
}: {
  applicationId: string;
  reference: string;
  bankAmountMinor: number;
  currency: string;
  initial: PaymentState;
  bank?: Bank;
  cardEnabled: boolean;
}) {
  const [payment, setPayment] = useState(initial);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [file, setFile] = useState<File>();
  const [pollingEnded, setPollingEnded] = useState(false);
  const running = useRef(false);
  const endpoint = `/api/public/payments/${applicationId}`;
  const settled = ["verified", "waived", "refunded"].includes(payment.status);
  const reviewing = ["proof_submitted", "under_review"].includes(
    payment.status,
  );
  const request = useCallback(
    async (action: string) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.message ?? "Please try again.");
      return result.data;
    },
    [endpoint],
  );
  const refresh = useCallback(async () => {
    const next: PaymentState = await request("status");
    setPayment(next);
    return next;
  }, [request]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let checks = 0;
    const tick = async () => {
      if (cancelled) return;
      if (running.current || document.hidden) {
        timer = setTimeout(tick, 15000);
        return;
      }
      try {
        const next = await request("status");
        if (cancelled) return;
        setPayment(next);
        if (next.status !== "awaiting_payment" || !next.attempt?.active) return;
      } catch {
        if (!cancelled)
          setError(
            "We could not check payment status. Please try again before paying again.",
          );
      }
      if (++checks < 8) timer = setTimeout(tick, 15000);
      else if (!cancelled) setPollingEnded(true);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [request]);
  async function act(action: "checkout" | "bank_transfer" | "status") {
    if (running.current) return;
    running.current = true;
    setBusy(action);
    setError(undefined);
    try {
      const result = await request(action);
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      if (action === "checkout") await refresh();
      else setPayment(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
      try {
        await refresh();
      } catch {
        /* Keep the original action error visible. */
      }
    } finally {
      running.current = false;
      setBusy(undefined);
    }
  }
  async function uploadProof() {
    if (!file || running.current) return;
    running.current = true;
    setBusy("upload");
    setError(undefined);
    try {
      if (
        file.size > MAX_FILE_SIZE ||
        !(paymentTypes as readonly string[]).includes(file.type)
      )
        throw new Error("Choose a PDF, JPEG, PNG or WebP, up to 5 MB.");
      const prepared = await fetch(`${endpoint}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          name: file.name,
          size: file.size,
          type: file.type,
        }),
        signal: AbortSignal.timeout(25000),
      });
      const target = await prepared.json();
      if (!target.ok) throw new Error(target.message);
      const uploaded = await fetch(target.data.url, {
        method: "PUT",
        headers: target.data.headers,
        body: file,
        signal: AbortSignal.timeout(120000),
      });
      if (!uploaded.ok)
        throw new Error("The upload was interrupted. Please retry.");
      const complete = await fetch(`${endpoint}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          fileId: target.data.fileId,
        }),
        signal: AbortSignal.timeout(25000),
      });
      const result = await complete.json();
      if (!result.ok) throw new Error(result.message);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The upload could not be completed. Please retry.",
      );
    } finally {
      running.current = false;
      setBusy(undefined);
    }
  }
  const waiting = payment.attempt?.active;
  return (
    <section className="surface rounded-xl p-5 sm:p-8">
      <p className="break-all font-mono text-xs text-muted-foreground">
        {reference}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="page-heading text-3xl">
          {payment.status === "verified"
            ? "Payment confirmed"
            : reviewing
              ? "Payment proof received"
              : payment.status === "refunded"
                ? "Payment refunded"
                : "Complete your payment"}
        </h1>
        <p className="whitespace-nowrap text-lg font-semibold">
          {new Intl.NumberFormat("en-LK", {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
          }).format(payment.amountMinor / 100)}
        </p>
      </div>
      {settled || reviewing ? (
        <div className="mt-6 flex gap-3 rounded-lg bg-muted p-4 text-sm">
          <CheckCircle2 className="size-5 shrink-0" />
          <div>
            <p>
              {payment.status === "verified"
                ? payment.method === "card"
                  ? "Your card payment is verified. No payment slip is needed."
                  : "Your bank transfer is verified."
                : reviewing
                  ? "The team will review your bank transfer."
                  : "Your payment record is up to date."}
            </p>
            {payment.receipt && (
              <p className="mt-2 font-mono text-xs">{payment.receipt}</p>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Your nomination is saved.{" "}
            {waiting
              ? "We are waiting for Genie to confirm your payment."
              : "Choose how you would like to pay."}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {cardEnabled && (
              <Button
                disabled={Boolean(busy)}
                onClick={() => void act("checkout")}
                className="h-auto min-h-14 gap-2 whitespace-normal px-5 py-3 leading-6"
              >
                {busy === "checkout" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <CreditCard />
                )}{" "}
                {waiting ? "Continue card checkout" : "Pay securely by card"}
              </Button>
            )}
            {bank && (
              <Button
                variant="outline"
                disabled={Boolean(busy) || payment.method === "bank_transfer"}
                onClick={() => void act("bank_transfer")}
                className="h-auto min-h-14 gap-2 whitespace-normal px-5 py-3 leading-6"
              >
                {busy === "bank_transfer" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Landmark />
                )}{" "}
                Bank transfer
              </Button>
            )}
          </div>
          {cardEnabled &&
            payment.cardAmountMinor !== bankAmountMinor &&
            !waiting && (
              <p className="mt-3 text-sm text-muted-foreground">
                Card test: {currency}{" "}
                {(payment.cardAmountMinor / 100).toLocaleString("en-LK")}. Bank
                transfer: {currency}{" "}
                {(bankAmountMinor / 100).toLocaleString("en-LK")}.
              </p>
            )}
          {payment.method === "bank_transfer" && bank && (
            <div className="mt-6 border-t pt-5">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <Landmark aria-hidden className="size-5" />
                Bank account details
              </h2>
              <dl className="grid gap-4 rounded-lg border bg-muted/40 p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Account name
                  </dt>
                  <dd className="break-words">{bank.accountName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Bank</dt>
                  <dd>
                    {bank.bankName}
                    {bank.branchName ? `, ${bank.branchName}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Account number
                  </dt>
                  <dd className="break-all font-mono">{bank.accountNumber}</dd>
                </div>
              </dl>
              <label
                htmlFor="payment-slip"
                className="mt-5 block text-sm font-medium"
              >
                Payment slip or screenshot
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF or image, up to 5 MB.
              </p>
              <Input
                id="payment-slip"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={Boolean(busy)}
                className="mt-2 h-auto min-h-12 w-full min-w-0 py-2 file:mr-3 file:h-8"
                onChange={(event) => setFile(event.target.files?.[0])}
              />
              <Button
                className="mt-4 h-auto min-h-14 w-full gap-2 whitespace-normal px-6 py-3 text-base font-semibold leading-6 sm:w-auto"
                disabled={Boolean(busy) || !file}
                onClick={() => void uploadProof()}
              >
                {busy === "upload" && <LoaderCircle className="animate-spin" />}
                Submit payment proof
              </Button>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {error}
        </p>
      )}
      {!settled && !reviewing && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            className="h-auto min-h-11 whitespace-normal px-4 py-2"
            disabled={Boolean(busy)}
            onClick={() => void act("status")}
          >
            {busy === "status" && <LoaderCircle className="animate-spin" />}
            Check payment status
          </Button>
          {pollingEnded && (
            <p className="text-xs text-muted-foreground">
              Use this to check again when ready.
            </p>
          )}
        </div>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        Need help?{" "}
        <a className="underline" href="mailto:info@gbeaward.com">
          Contact the GBE Awards team
        </a>
        .
      </p>
    </section>
  );
}
