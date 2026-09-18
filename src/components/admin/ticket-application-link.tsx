"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, LoaderCircle, Search } from "lucide-react";
import { toast } from "sonner";
import {
  findTicketApplications,
  linkGuestBooking,
} from "@/server/actions/ticket-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function TicketApplicationLink({
  bookingId,
  cycleId,
  applicationId,
  quantity,
}: {
  bookingId: string;
  cycleId: string;
  applicationId: string | null;
  quantity: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<
    Awaited<ReturnType<typeof findTicketApplications>>
  >([]);
  const [selected, setSelected] = useState<(typeof results)[number] | null>(
    null,
  );
  const lock = useRef(false);
  const router = useRouter();
  async function save(id: string | null) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await linkGuestBooking({
        bookingId,
        applicationId: id,
        expectedApplicationId: applicationId,
      });
      if (!result.ok) setError(result.message);
      else {
        setOpen(false);
        toast.success(
          id ? "Booking linked to application" : "Application link removed",
        );
        router.refresh();
      }
    } catch {
      setError(
        "Could not confirm the change. Retry or refresh to check the saved link.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          setResults([]);
          setSelected(null);
          setError("");
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" className="h-11 min-h-11" />}
      >
        <Link2 aria-hidden />
        {applicationId ? "Change application" : "Link application"}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link booking</DialogTitle>
          <DialogDescription>
            Link {quantity} {quantity === 1 ? "ticket" : "tickets"} to one
            application. Guest details stay unchanged.
          </DialogDescription>
        </DialogHeader>
        {!selected ? (
          <>
            <form
              className="flex items-end gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (lock.current) return;
                const query = String(
                  new FormData(event.currentTarget).get("query") ?? "",
                );
                lock.current = true;
                setBusy(true);
                setError("");
                try {
                  const found = await findTicketApplications(cycleId, query);
                  setResults(found);
                  if (!found.length)
                    setError("No matching submitted applications.");
                } catch {
                  setError("Search could not be completed. Try again.");
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            >
              <Field>
                <FieldLabel htmlFor="link-application-query">
                  Name, reference or email
                </FieldLabel>
                <Input
                  id="link-application-query"
                  name="query"
                  minLength={2}
                  maxLength={100}
                  required
                  disabled={busy}
                />
              </Field>
              <Button
                type="submit"
                variant="outline"
                className="size-11 shrink-0"
                aria-label="Search applications"
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle aria-hidden className="animate-spin" />
                ) : (
                  <Search aria-hidden />
                )}
              </Button>
            </form>
            <div className="space-y-2">
              {results.map((application) => (
                <button
                  key={application.id}
                  type="button"
                  disabled={busy}
                  className="w-full rounded-xl border p-3 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [overflow-wrap:anywhere]"
                  onClick={() => setSelected(application)}
                >
                  <span className="block font-medium">{application.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {application.reference} · {application.email}
                  </span>
                </button>
              ))}
            </div>
            {applicationId && (
              <Button
                variant="ghost"
                className="h-11 min-h-11"
                disabled={busy}
                onClick={() =>
                  setSelected({
                    id: "",
                    name: "Remove application link?",
                    email: "The booking and tickets will remain unchanged.",
                    reference: null,
                  })
                }
              >
                Remove link
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="rounded-xl bg-muted p-4 [overflow-wrap:anywhere]">
              <p className="font-medium">{selected.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {selected.reference ? `${selected.reference} · ` : ""}
                {selected.email}
              </p>
            </div>
            <Button
              className="h-12 min-h-12"
              disabled={busy}
              onClick={() => void save(selected.id || null)}
            >
              {busy && <LoaderCircle aria-hidden className="animate-spin" />}
              {selected.id ? "Link booking" : "Remove link"}
            </Button>
            <Button
              variant="ghost"
              className="h-11 min-h-11"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Back
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
