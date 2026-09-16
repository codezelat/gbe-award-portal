"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  generateSpecialInvites,
  cancelSpecialInvite,
} from "@/server/actions/special-invite-actions";

async function downloadInvite(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (
    !response.ok ||
    !["image/jpeg", "application/zip"].includes(contentType)
  ) {
    const data = contentType.includes("json") ? await response.json() : null;
    throw new Error(
      data?.message ?? "Could not download. Check your sign-in and retry.",
    );
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download =
    response.headers
      .get("content-disposition")
      ?.match(/filename="([A-Za-z0-9.-]+)"/)?.[1] ?? "GBE-special-invites.zip";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function InviteDownload({ id, batch }: { id?: string; batch?: string }) {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  async function download() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      await downloadInvite(
        `/api/admin/special-invites/download?${id ? `id=${id}` : `batch=${batch}`}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Download failed. Please retry.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      loading={pending}
      loadingLabel="Preparing"
      onClick={() => void download()}
      aria-label={id ? "Download invite JPG" : "Download unused invites ZIP"}
    >
      <Download data-icon="inline-start" />
      {id ? "JPG" : "Download ZIP"}
    </Button>
  );
}

export function GenerateInvites({
  cycleId,
  currency,
  cycleName,
}: {
  cycleId: string;
  currency: string;
  cycleName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [batch, setBatch] = useState<string>();
  const requestId = useRef<string>(crypto.randomUUID());
  const lock = useRef(false);
  const router = useRouter();
  function generate(data: FormData) {
    if (lock.current) return;
    lock.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await generateSpecialInvites({
          requestId: requestId.current,
          cycleId,
          amount: String(data.get("amount")),
          quantity: Number(data.get("quantity")),
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setBatch(result.batchId);
        router.refresh();
        try {
          await downloadInvite(
            `/api/admin/special-invites/download?batch=${result.batchId}`,
          );
        } catch {
          setError("Invites created. Use Download ZIP to retry the download.");
        }
      } catch {
        setError("Could not confirm generation. Retry with the same details.");
      } finally {
        lock.current = false;
      }
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        if (value) {
          requestId.current = crypto.randomUUID();
          setBatch(undefined);
          setError("");
        }
      }}
    >
      <DialogTrigger render={<Button type="button" className="h-11" />}>
        <Plus data-icon="inline-start" />
        Generate invites
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {batch ? "Invites created" : "Generate invites"}
          </DialogTitle>
          <DialogDescription>{cycleName}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {batch ? (
          <div className="flex flex-col gap-3">
            <InviteDownload batch={batch} />
            <Button
              variant="ghost"
              className="h-11"
              render={<Link href={`/admin/special-invites?batch=${batch}`} />}
              onClick={() => setOpen(false)}
            >
              View this batch
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              generate(new FormData(event.currentTarget));
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="invite-amount">
                  Discount ({currency})
                </FieldLabel>
                <Input
                  id="invite-amount"
                  name="amount"
                  type="number"
                  min="0.01"
                  max="20000000"
                  step="0.01"
                  required
                  disabled={pending}
                  className="h-11"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-quantity">
                  Number of invites
                </FieldLabel>
                <Input
                  id="invite-quantity"
                  name="quantity"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  defaultValue="1"
                  required
                  disabled={pending}
                  className="h-11"
                />
              </Field>
              <Button
                type="submit"
                className="h-11 w-full"
                loading={pending}
                loadingLabel="Generating"
              >
                Generate & download ZIP
              </Button>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CancelInvite({ id, code }: { id: string; code: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value);
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={`Cancel invite ${code}`}
          />
        }
      >
        <X data-icon="inline-start" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this invite?</DialogTitle>
          <DialogDescription>
            It will no longer be claimable. Other invites are unchanged.
          </DialogDescription>
        </DialogHeader>
        <Button
          variant="destructive"
          className="h-11"
          loading={pending}
          loadingLabel="Cancelling"
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await cancelSpecialInvite(id);
                if (!result.ok) {
                  toast.error(result.message);
                  return;
                }
                setOpen(false);
                router.refresh();
              } catch {
                toast.error("Could not cancel. Please retry.");
              }
            })
          }
        >
          Cancel invite
        </Button>
      </DialogContent>
    </Dialog>
  );
}
