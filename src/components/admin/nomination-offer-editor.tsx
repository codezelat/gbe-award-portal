"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Timer } from "lucide-react";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";
import {
  type NominationOffer,
  type NominationPricing,
} from "@/lib/domain/nomination-pricing";
import {
  saveNominationOfferAction,
  type OfferActionState,
} from "@/server/actions/nomination-offer-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

type EditorProps = {
  cycleId: string;
  revision: string;
  offer: NominationOffer | null;
  pricing: NominationPricing;
};
const money = (amount: number | null, currency: string | null) =>
  amount === null
    ? "Not set"
    : `${currency ?? ""} ${(amount / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const localTime = (timestamp: number) =>
  formatInTimeZone(timestamp, "Asia/Colombo", "yyyy-MM-dd'T'HH:mm");
const dateLabel = (timestamp: number) =>
  formatInTimeZone(timestamp, "Asia/Colombo", "d MMM, h:mm a");

export function NominationOfferEditor(props: EditorProps) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { offer, pricing } = props;
  const status = {
    none: "Not set",
    upcoming: "Scheduled",
    active: "Active",
    ended: "Ended",
    disabled: "Off",
  }[pricing.phase];
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-4 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Timer className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-semibold">Nomination offer</h2>
          <Badge variant="secondary">{status}</Badge>
        </div>
        <p className="mt-2 text-sm">
          Current fee:{" "}
          <span className="font-medium">
            {money(pricing.amountMinor, pricing.currency)}
          </span>
        </p>
        {offer?.enabled ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {dateLabel(offer.startsAt)} to {dateLabel(offer.endsAt)} (Colombo)
          </p>
        ) : null}
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="min-h-11 shrink-0"
              disabled={!pricing.currency || refreshing || busy}
            />
          }
        >
          {offer ? "Edit offer" : "Set up offer"}
        </DialogTrigger>
        {open ? (
          <DialogContent
            showCloseButton={false}
            className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg"
          >
            <OfferForm
              {...props}
              onBusy={setBusy}
              onSaved={() => {
                setOpen(false);
                startRefresh(() => router.refresh());
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function OfferForm({
  cycleId,
  revision,
  offer,
  pricing,
  onBusy,
  onSaved,
}: EditorProps & { onBusy: (busy: boolean) => void; onSaved: () => void }) {
  const router = useRouter();
  const id = useId();
  const [enabled, setEnabled] = useState(offer?.enabled ?? true);
  const [banner, setBanner] = useState(
    offer?.bannerText ?? "Last chance: Nominate with Discount",
  );
  // Keep this editor's revision fixed even if a conflict refreshes the parent.
  const [editingRevision] = useState(revision);
  const [values, setValues] = useState({
    amount: offer ? String(offer.amountMinor / 100) : "",
    standardAmount: String(
      (offer?.standardAmountMinor ?? pricing.amountMinor ?? 0) / 100,
    ),
    startsAt: localTime(offer?.startsAt ?? pricing.serverNow),
    endsAt: localTime(offer?.endsAt ?? pricing.serverNow + 86_400_000),
  });
  const field = (name: keyof typeof values) => ({
    value: values[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((current) => ({ ...current, [name]: event.target.value })),
  });
  const [state, action, pending] = useActionState<OfferActionState, FormData>(
    async (previous, data) => {
      onBusy(true);
      try {
        const result = await saveNominationOfferAction(previous, data);
        if (result.status === "success") {
          toast.success(result.message);
          onSaved();
        } else {
          router.refresh();
        }
        return result;
      } catch {
        return {
          status: "error" as const,
          message: "Could not save. Your edits are still here; please retry.",
        };
      } finally {
        onBusy(false);
      }
    },
    { status: "idle", message: "" },
  );
  return (
    <form action={action} className="min-w-0">
      <input type="hidden" name="cycleId" value={cycleId} />
      <input type="hidden" name="revision" value={editingRevision} />
      <input type="hidden" name="currency" value={pricing.currency ?? ""} />
      <div className="flex items-start justify-between gap-4">
        <DialogHeader>
          <DialogTitle>Nomination offer</DialogTitle>
          <DialogDescription>
            New nominations only. Existing payments stay unchanged.
          </DialogDescription>
        </DialogHeader>
        <DialogClose
          render={
            <Button
              type="button"
              variant="ghost"
              className="size-11 shrink-0"
              disabled={pending}
              aria-label="Close offer editor"
            />
          }
        >
          <X aria-hidden />
        </DialogClose>
      </div>
      <fieldset disabled={pending} className="mt-5 grid min-w-0 gap-5">
        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-enabled`}
            name="enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <FieldLabel htmlFor={`${id}-enabled`} className="min-h-11">
            Enable scheduled offer
          </FieldLabel>
        </Field>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field className="min-w-0">
            <FieldLabel htmlFor={`${id}-amount`}>
              Offer fee ({pricing.currency})
            </FieldLabel>
            <Input
              id={`${id}-amount`}
              name="amount"
              type="number"
              min="0.01"
              max="20000000"
              step="0.01"
              inputMode="decimal"
              required
              {...field("amount")}
              className="h-11"
            />
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor={`${id}-standard`}>
              Regular fee ({pricing.currency})
            </FieldLabel>
            <Input
              id={`${id}-standard`}
              name="standardAmount"
              type="number"
              min="0.01"
              max="20000000"
              step="0.01"
              inputMode="decimal"
              required
              {...field("standardAmount")}
              className="h-11"
            />
          </Field>
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field className="min-w-0">
            <FieldLabel htmlFor={`${id}-start`}>Starts (Colombo)</FieldLabel>
            <Input
              id={`${id}-start`}
              name="startsAt"
              type="datetime-local"
              required
              {...field("startsAt")}
              className="h-11 min-w-0"
            />
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor={`${id}-end`}>Ends (Colombo)</FieldLabel>
            <Input
              id={`${id}-end`}
              name="endsAt"
              type="datetime-local"
              required
              {...field("endsAt")}
              className="h-11 min-w-0"
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`${id}-banner`}>Banner wording</FieldLabel>
          <Input
            id={`${id}-banner`}
            name="bannerText"
            maxLength={80}
            required
            value={banner}
            onChange={(event) => setBanner(event.target.value)}
            className="h-11"
          />
          <FieldDescription>
            {enabled
              ? "Regular fee applies after the end time."
              : "Offer off: regular fee applies immediately."}
          </FieldDescription>
        </Field>
        {enabled ? (
          <div
            aria-label="Banner preview"
            className="flex min-w-0 flex-col items-center gap-2 rounded-lg bg-[#b42332] p-4 text-center text-white"
          >
            <p className="max-w-full break-words text-sm font-semibold">
              {banner}
            </p>
            <p className="text-base font-semibold">
              Offer ends in{" "}
              <span className="ml-2 rounded bg-black/15 px-2 py-1 tabular-nums">
                24:00:00
              </span>
            </p>
          </div>
        ) : null}
        {state.status === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
      </fieldset>
      <DialogFooter className="mt-5">
        <DialogClose
          render={
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
            />
          }
        >
          Cancel
        </DialogClose>
        <Button
          type="submit"
          className="min-h-11"
          loading={pending}
          loadingLabel="Saving"
        >
          Save offer
        </Button>
      </DialogFooter>
    </form>
  );
}
