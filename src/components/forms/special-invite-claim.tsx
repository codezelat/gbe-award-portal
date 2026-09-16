"use client";

import { useRef, useState } from "react";
import { ImageUp, TicketCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { DraftCredential } from "@/lib/validation/nomination-draft";
import type { NominationPricing } from "@/lib/domain/nomination-pricing";
import { normaliseInviteCode } from "@/lib/domain/special-invite";
import { OfferCountdown, useNominationPricing } from "./nomination-offer";
import { cn } from "@/lib/utils";

export function SpecialInviteClaim({
  credential,
  disabled,
  returnFocusRef,
  onClaim,
}: {
  credential: DraftCredential | null;
  disabled: boolean;
  returnFocusRef: React.RefObject<HTMLHeadingElement | null>;
  onClaim: (amountMinor: number | undefined) => void;
}) {
  const { pricing, updatePricing } = useNominationPricing();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);

  async function apply(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (lock.current || !credential) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/public/special-invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential, code }),
        signal: AbortSignal.timeout(15000),
      });
      const result: {
        ok: boolean;
        message?: string;
        pricing?: NominationPricing;
      } = await response.json();
      if (!response.ok || !result.ok || !result.pricing)
        throw new Error(result.message ?? "Could not apply your invite.");
      updatePricing(result.pricing);
      onClaim(result.pricing.amountMinor ?? undefined);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "Error"
          ? err.message
          : "Could not confirm your invite. Retry the same code; your timer will not restart.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  async function readImage(file?: File) {
    if (!file || lock.current) return;
    setError("");
    if (
      !/^image\/(jpeg|png|webp)$/.test(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Choose a JPG, PNG or WebP image up to 5 MB.");
      return;
    }
    lock.current = true;
    setPending(true);
    try {
      const { decodeInviteImage } =
        await import("@/lib/browser/decode-invite-image");
      setCode(await decodeInviteImage(file));
      input.current?.focus();
    } catch {
      setError("Barcode not found. Enter the six-character code below it.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError("");
        }
      }}
    >
      {!pricing.specialInvite ? (
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-h-11 max-w-full whitespace-normal py-1"
              disabled={disabled || !credential}
            />
          }
        >
          <TicketCheck data-icon="inline-start" className="hidden sm:block" />
          Claim Special Invite
        </DialogTrigger>
      ) : null}
      <DialogContent
        className="sm:max-w-sm"
        aria-describedby={undefined}
        finalFocus={() =>
          pricing.specialInvite ? returnFocusRef.current : true
        }
      >
        <DialogHeader>
          <DialogTitle>Claim Special Invite</DialogTitle>
        </DialogHeader>
        <form onSubmit={apply}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="special-invite-code">Invite code</FieldLabel>
              <Input
                ref={input}
                id="special-invite-code"
                value={code}
                onChange={(e) => setCode(normaliseInviteCode(e.target.value))}
                maxLength={6}
                minLength={6}
                pattern="[A-Za-z0-9]{6}"
                required
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={pending}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "invite-error" : undefined}
                className="h-12"
              />
              {error ? (
                <FieldError id="invite-error">{error}</FieldError>
              ) : null}
            </Field>
            <Button
              type="submit"
              className="h-11 w-full"
              loading={pending}
              loadingLabel="Please wait"
              disabled={code.length !== 6}
            >
              Apply invite
            </Button>
            <input
              ref={picker}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              tabIndex={-1}
              onChange={(e) => {
                void readImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full"
              disabled={pending}
              onClick={() => picker.current?.click()}
            >
              <ImageUp data-icon="inline-start" />
              Upload barcode image
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SpecialInviteNotice({ className }: { className?: string }) {
  const { pricing } = useNominationPricing();
  const invite = pricing.specialInvite;
  if (!invite || invite.status === "used") return null;
  if (invite.status !== "active")
    return (
      <Alert className={className}>
        <AlertDescription>
          Your special invite{" "}
          {invite.status === "expired" ? "expired" : "is no longer available"}.
          The current fee applies.
        </AlertDescription>
      </Alert>
    );
  return (
    <aside
      aria-label="Special invite validity"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg bg-destructive px-4 py-3 text-white",
        className,
      )}
    >
      <p className="text-sm font-semibold">Special invite ends in</p>
      <OfferCountdown endsAt={invite.expiresAt} serverNow={pricing.serverNow} />
    </aside>
  );
}
