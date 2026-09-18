"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ticketMoney } from "@/lib/domain/tickets";
export function TicketQuantity({
  sale,
  initialQuantity,
}: {
  sale: { price: number; currency: string; maximum: number; id: string };
  initialQuantity: number;
}) {
  const [quantity, setQuantity] = useState(
    Math.min(sale.maximum, Math.max(1, Math.floor(initialQuantity))),
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <h2 className="text-lg font-semibold">How many guests?</h2>
      <div
        className="my-8 flex items-center justify-between gap-4"
        role="group"
        aria-label="Number of guests"
      >
        <Button
          variant="outline"
          size="icon"
          className="size-12"
          disabled={pending || quantity <= 1}
          onClick={() => setQuantity(quantity - 1)}
          aria-label="Remove one guest"
        >
          <Minus aria-hidden />
        </Button>
        <output
          className="text-4xl font-semibold tabular-nums"
          aria-live="polite"
        >
          {quantity}
        </output>
        <Button
          variant="outline"
          size="icon"
          className="size-12"
          disabled={pending || quantity >= sale.maximum}
          onClick={() => setQuantity(quantity + 1)}
          aria-label="Add one guest"
        >
          <Plus aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
        <span className="text-sm text-muted-foreground">Total</span>
        <strong className="text-2xl tabular-nums">
          {ticketMoney(sale.price * quantity, sale.currency)}
        </strong>
      </div>
      <Button
        className="mt-7 h-12 min-h-12 w-full rounded-xl"
        disabled={pending}
        onClick={() =>
          startTransition(() =>
            router.push(
              `/tickets/checkout?quantity=${quantity}&sale=${sale.id}`,
            ),
          )
        }
      >
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
        Continue{!pending && <ArrowRight aria-hidden />}
      </Button>
    </section>
  );
}
