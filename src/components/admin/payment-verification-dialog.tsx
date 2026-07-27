"use client";

import { useActionState, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  updatePaymentWithStateAction,
  type PaymentActionState,
} from "@/server/actions/application-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const initialState: PaymentActionState = { status: "idle", message: "" };

export function PaymentVerificationDialog({
  applicationId,
  applicationReference,
  paymentReference,
  proofName,
  payerName,
  bankReference,
  amount,
  currency,
  paidAt,
  blockingGaps,
}: {
  applicationId: string;
  applicationReference: string;
  paymentReference?: string | null;
  proofName?: string | null;
  payerName?: string | null;
  bankReference?: string | null;
  amount?: string;
  currency?: string | null;
  paidAt?: string;
  blockingGaps: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    updatePaymentWithStateAction,
    initialState,
  );

  useEffect(() => {
    if (state.status !== "success") return;
    toast.success(state.message);
  }, [state.message, state.status]);

  return (
    <Dialog
      open={state.status === "success" ? false : open}
      onOpenChange={(nextOpen) => {
        if (!pending) setOpen(nextOpen);
      }}
    >
      <DialogTrigger render={<Button type="button" size="sm" />}>
        Verify
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto p-5 sm:max-w-lg">
        <form action={action}>
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="status" value="verified" />
          <DialogHeader>
            <DialogTitle>Verify payment</DialogTitle>
            <DialogDescription>
              Check the evidence and record the required reconciliation details
              for {applicationReference}.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-1 rounded-lg border bg-muted/45 p-3 text-sm">
              <span className="font-medium">
                {proofName ?? "No current payment proof"}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {paymentReference ?? "Payment reference pending"}
              </span>
            </div>

            {blockingGaps.length ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Complete the full record before verification:{" "}
                  {blockingGaps.join(", ")}.
                </AlertDescription>
              </Alert>
            ) : null}

            {state.status === "error" ? (
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            ) : null}

            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Paid amount
                <Input
                  name="amount"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={amount}
                  placeholder="55000.00"
                  className="h-11 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Currency
                <Input
                  name="currency"
                  required
                  minLength={3}
                  maxLength={3}
                  defaultValue={currency ?? "LKR"}
                  className="h-11 bg-white uppercase"
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm font-medium">
              Paid date and time
              <Input
                name="paidAt"
                type="datetime-local"
                required
                defaultValue={paidAt}
                className="h-11 bg-white"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Payer name <span className="sr-only">(optional)</span>
                <Input
                  name="payerName"
                  defaultValue={payerName ?? ""}
                  placeholder="Optional"
                  maxLength={180}
                  className="h-11 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Bank reference <span className="sr-only">(optional)</span>
                <Input
                  name="bankReference"
                  defaultValue={bankReference ?? ""}
                  placeholder="Optional"
                  maxLength={160}
                  className="h-11 bg-white"
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm font-medium">
              Finance note <span className="sr-only">(optional)</span>
              <Textarea
                name="note"
                maxLength={2000}
                placeholder="Optional internal context"
                className="min-h-20 bg-white"
              />
            </label>
          </div>

          <DialogFooter className="mt-5">
            <DialogClose
              render={<Button type="button" variant="outline" disabled={pending} />}
            >
              Cancel
            </DialogClose>
            <Button
              disabled={blockingGaps.length > 0}
              loading={pending}
              loadingLabel="Verifying"
            >
              <ShieldCheck data-icon="inline-start" />
              Confirm verification
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
