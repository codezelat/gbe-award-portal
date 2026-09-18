"use client";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { LoaderCircle, Search, Settings2, TicketPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  admitGuestTicket,
  findTicketApplications,
  issueGuestTickets,
  manageTicketBooking,
  saveTicketSettings,
} from "@/server/actions/ticket-actions";
import type { TicketSale } from "@/server/services/tickets";
import { parseOfferAmount } from "@/lib/validation/nomination-offer";

function Labeled({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
    </Field>
  );
}
export function TicketSettings({
  cycleId,
  cycleName,
  sale,
}: {
  cycleId: string;
  cycleName: string;
  sale?: TicketSale;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const router = useRouter();
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) setOpen(value);
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" className="h-11 min-h-11" />}
      >
        <Settings2 aria-hidden />
        {sale ? "Sales settings" : "Set up tickets"}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Guest ticket sales</DialogTitle>
          <DialogDescription>
            Set the price and release capacity for {cycleName}.
          </DialogDescription>
        </DialogHeader>
        <form
          key={`${open}-${sale?.revision}`}
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (lock.current) return;
            const data = new FormData(event.currentTarget);
            setError("");
            lock.current = true;
            setBusy(true);
            try {
              const localDate = String(data.get("eventAt") ?? "");
              const result = await saveTicketSettings({
                cycleId,
                revision: sale?.revision ?? 0,
                title: data.get("title"),
                venue: data.get("venue"),
                eventAt: localDate
                  ? fromZonedTime(localDate, "Asia/Colombo").toISOString()
                  : null,
                capacity: Number(data.get("capacity")),
                unitPriceMinor: parseOfferAmount(String(data.get("price"))),
                maxPerBooking: Number(data.get("maximum")),
                status: data.get("status"),
              });
              if (!result.ok) setError(result.message);
              else {
                toast.success("Ticket sales updated");
                setOpen(false);
                router.refresh();
              }
            } catch {
              setError("Enter a valid price and event date.");
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <Labeled id="sale-title" label="Event name">
              <Input
                id="sale-title"
                name="title"
                required
                maxLength={160}
                defaultValue={sale?.title ?? cycleName}
              />
            </Labeled>
            <Labeled id="sale-date" label="Event date and time (Colombo)">
              <Input
                id="sale-date"
                name="eventAt"
                type="datetime-local"
                defaultValue={
                  sale?.eventAt
                    ? formatInTimeZone(
                        sale.eventAt,
                        "Asia/Colombo",
                        "yyyy-MM-dd'T'HH:mm",
                      )
                    : ""
                }
              />
            </Labeled>
            <Labeled id="sale-venue" label="Venue">
              <Input
                id="sale-venue"
                name="venue"
                maxLength={240}
                defaultValue={sale?.venue ?? ""}
              />
            </Labeled>
            <div className="grid min-w-0 grid-cols-2 gap-4">
              <Labeled id="sale-price" label="Price per ticket (LKR)">
                <Input
                  id="sale-price"
                  name="price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={
                    sale?.unitPriceMinor ? sale.unitPriceMinor / 100 : ""
                  }
                />
              </Labeled>
              <Labeled id="sale-capacity" label="Total capacity">
                <Input
                  id="sale-capacity"
                  name="capacity"
                  type="number"
                  min="1"
                  max="100000"
                  required
                  defaultValue={sale?.capacity || ""}
                />
              </Labeled>
            </div>
            <FieldDescription>
              Increase total capacity to release more tickets. Existing bookings
              keep their price.
            </FieldDescription>
            <Labeled id="sale-maximum" label="Maximum per booking">
              <Input
                id="sale-maximum"
                name="maximum"
                type="number"
                min="1"
                max="20"
                required
                defaultValue={sale?.maxPerBooking ?? 10}
              />
            </Labeled>
            <Labeled id="sale-status" label="Sales status">
              <select
                id="sale-status"
                name="status"
                defaultValue={sale?.status ?? "draft"}
                className="h-11 min-h-11 w-full rounded-lg border bg-background px-3"
              >
                <option value="draft">Draft, not public</option>
                <option value="open">Open for bookings</option>
                <option value="paused">Paused</option>
                <option value="closed">Closed</option>
              </select>
            </Labeled>
            <FieldError>{error}</FieldError>
            <Button
              type="submit"
              className="h-11 min-h-11 w-full"
              disabled={busy}
            >
              {busy && <LoaderCircle aria-hidden className="animate-spin" />}
              Save settings
            </Button>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ApplicationChoice = Awaited<
  ReturnType<typeof findTicketApplications>
>[number];
export function ComplimentaryTickets({
  salesId,
  cycleId,
}: {
  salesId: string;
  cycleId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApplicationChoice[]>([]);
  const [selected, setSelected] = useState<ApplicationChoice | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const requestId = useRef("");
  const router = useRouter();
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          if (!value) {
            requestId.current = "";
            setSubmitted(false);
            setSelected(null);
            setResults([]);
            setQuery("");
            setError("");
          }
        }
      }}
    >
      <DialogTrigger render={<Button className="h-11 min-h-11" />}>
        <TicketPlus aria-hidden />
        Complimentary tickets
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue guest tickets</DialogTitle>
          <DialogDescription>
            Choose a submitted application. Tickets go to its saved email.
          </DialogDescription>
        </DialogHeader>
        {!selected ? (
          <>
            <form
              className="flex items-end gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                setError("");
                try {
                  const found = await findTicketApplications(cycleId, query);
                  setResults(found);
                  if (!found.length)
                    setError("No matching submitted applications.");
                } catch {
                  setError("Search could not be completed.");
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            >
              <Field>
                <FieldLabel htmlFor="ticket-application-search">
                  Name, reference or email
                </FieldLabel>
                <Input
                  id="ticket-application-search"
                  minLength={2}
                  maxLength={100}
                  required
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="outline"
                size="icon"
                aria-label="Search applications"
                disabled={busy}
                className="size-10 shrink-0"
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
                  type="button"
                  key={application.id}
                  onClick={() => {
                    setSelected(application);
                    setError("");
                  }}
                  className="w-full rounded-xl border p-3 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block font-medium [overflow-wrap:anywhere]">
                    {application.name}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {application.reference} · {application.email}
                  </span>
                </button>
              ))}
            </div>
            <FieldError>{error}</FieldError>
          </>
        ) : (
          <form
            className="space-y-5"
            onSubmit={async (event) => {
              event.preventDefault();
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              const data = new FormData(event.currentTarget);
              requestId.current ||= crypto.randomUUID();
              setSubmitted(true);
              try {
                const result = await issueGuestTickets({
                  requestId: requestId.current,
                  salesId,
                  applicationId: selected.id,
                  quantity: Number(data.get("quantity")),
                  reason: data.get("reason"),
                });
                if (!result.ok) setError(result.message);
                else {
                  setOpen(false);
                  toast.success("Tickets issued and email queued");
                  router.push(`/admin/tickets/${result.id}`);
                }
              } catch {
                setError(
                  "Could not confirm issuance. Retry with the same details.",
                );
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <div className="rounded-xl bg-muted p-4">
              <p className="font-medium [overflow-wrap:anywhere]">
                {selected.name}
              </p>
              <p className="mt-1 text-sm [overflow-wrap:anywhere]">
                {selected.email}
              </p>
              <Button
                variant="link"
                type="button"
                className="mt-2 px-0"
                disabled={busy || submitted}
                onClick={() => setSelected(null)}
              >
                Change application
              </Button>
            </div>
            <fieldset disabled={busy} className="space-y-4">
              <Labeled id="complimentary-quantity" label="Tickets">
                <Input
                  id="complimentary-quantity"
                  name="quantity"
                  type="number"
                  defaultValue={1}
                  min={1}
                  max={20}
                  required
                />
              </Labeled>
              <Labeled id="complimentary-reason" label="Internal note">
                <Input
                  id="complimentary-reason"
                  name="reason"
                  minLength={3}
                  maxLength={300}
                  required
                />
              </Labeled>
              <FieldError>{error}</FieldError>
              <Button
                type="submit"
                className="h-11 min-h-11 w-full"
                disabled={busy}
              >
                {busy && <LoaderCircle aria-hidden className="animate-spin" />}
                Issue and email tickets
              </Button>
            </fieldset>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function TicketBookingActions({
  id,
  issued,
  complimentary,
  needsRecovery,
}: {
  id: string;
  issued: boolean;
  complimentary: boolean;
  needsRecovery: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<"resend" | "cancel" | "check" | null>(
    null,
  );
  const [error, setError] = useState("");
  const lock = useRef(false);
  const requestId = useRef("");
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {issued && (
        <Button
          variant="outline"
          className="h-11 min-h-11"
          onClick={() => {
            requestId.current = crypto.randomUUID();
            setError("");
            setAction("resend");
          }}
        >
          Resend email
        </Button>
      )}
      {!complimentary && (
        <Button
          variant="outline"
          className="h-11 min-h-11"
          onClick={() => {
            requestId.current = crypto.randomUUID();
            setError("");
            setAction("check");
          }}
        >
          Check payment
        </Button>
      )}
      {issued && complimentary && (
        <Button
          variant="outline"
          className="h-11 min-h-11 text-destructive"
          onClick={() => {
            requestId.current = crypto.randomUUID();
            setError("");
            setAction("cancel");
          }}
        >
          Cancel tickets
        </Button>
      )}
      <Dialog
        open={!!action}
        onOpenChange={(value) => {
          if (!value && !busy) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "resend"
                ? "Resend tickets?"
                : action === "cancel"
                  ? "Cancel complimentary tickets?"
                  : "Check card payment"}
            </DialogTitle>
            <DialogDescription>
              {action === "resend"
                ? "The ticket email will be sent again to the saved address."
                : action === "cancel"
                  ? "Unused QR tickets will be invalidated and capacity released."
                  : "Checks directly with Genie. Refunds must be made in the Genie dashboard."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!action || lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              const data = new FormData(event.currentTarget);
              try {
                const result = await manageTicketBooking({
                  id,
                  action,
                  requestId: requestId.current,
                  reason: String(data.get("reason") ?? ""),
                  transactionId: String(data.get("transactionId") ?? ""),
                });
                if (!result.ok) setError(result.message);
                else {
                  toast.success(
                    action === "resend"
                      ? "Ticket email queued"
                      : action === "cancel"
                        ? "Tickets cancelled"
                        : "Payment checked",
                  );
                  setAction(null);
                  router.refresh();
                }
              } catch {
                setError("Could not complete this action. Retry shortly.");
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              {action === "cancel" && (
                <Labeled id="cancel-ticket-reason" label="Reason">
                  <Input
                    id="cancel-ticket-reason"
                    name="reason"
                    minLength={3}
                    maxLength={300}
                    required
                  />
                </Labeled>
              )}
              {action === "check" && needsRecovery && (
                <Labeled
                  id="recover-ticket-payment"
                  label="Genie transaction ID"
                >
                  <Input
                    id="recover-ticket-payment"
                    name="transactionId"
                    pattern="[a-fA-F0-9]{24}"
                    required
                    maxLength={24}
                  />
                  <FieldDescription>
                    Use the matching transaction from Genie. Its amount and
                    reference will be verified.
                  </FieldDescription>
                </Labeled>
              )}
              <FieldError>{error}</FieldError>
              <Button
                type="submit"
                className="h-11 min-h-11 w-full"
                disabled={busy}
                variant={action === "cancel" ? "destructive" : "default"}
              >
                {busy && <LoaderCircle aria-hidden className="animate-spin" />}
                {action === "cancel" ? "Cancel tickets" : "Confirm"}
              </Button>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function AdmitTicket({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const router = useRouter();
  return (
    <div className="space-y-3">
      <Button
        className="h-12 min-h-12 w-full"
        disabled={busy}
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          try {
            const result = await admitGuestTicket(id);
            if (!result.ok) setError(result.message);
            else {
              toast.success("Guest checked in");
              router.refresh();
            }
          } catch {
            setError(
              "Check-in could not be confirmed. Refresh before trying again.",
            );
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {busy && <LoaderCircle aria-hidden className="animate-spin" />}Confirm
        check-in
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
