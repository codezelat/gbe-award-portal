import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, eq, lt, ne, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { TICKET_DETAILS_MS } from "@/lib/domain/ticket-timing";
import {
  applications,
  auditLogs,
  awardCycles,
  emailOutbox,
  guestTickets,
  ticketBookings,
  ticketPaymentAttempts,
  ticketSales,
} from "@/lib/db/schema";
import {
  ticketBookingSchema,
  ticketSettingsSchema,
} from "@/lib/domain/tickets";
import {
  nonDeletedApplications,
  submittedApplications,
} from "@/server/dal/application-visibility";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export type TicketSale = typeof ticketSales.$inferSelect;
export type TicketBooking = typeof ticketBookings.$inferSelect;
export class TicketError extends Error {}
export const ticketHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function ticketSecretMatches(secret: string, hash: string) {
  return (
    /^[a-f0-9]{64}$/.test(hash) &&
    timingSafeEqual(
      Buffer.from(ticketHash(secret), "hex"),
      Buffer.from(hash, "hex"),
    )
  );
}
// All inventory mutations lock the sale first, then booking and ticket rows.
export async function lockTicketSale(tx: Tx, id: string) {
  const [sale] = await tx
    .select()
    .from(ticketSales)
    .where(eq(ticketSales.id, id))
    .for("update");
  if (!sale) throw new TicketError("Ticket sales are not available.");
  return sale;
}
async function expireUnstarted(tx: Tx, salesId: string) {
  await tx
    .update(ticketBookings)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(ticketBookings.salesId, salesId),
        eq(ticketBookings.status, "pending"),
        lt(ticketBookings.holdUntil, new Date()),
        notExists(
          tx
            .select({ id: ticketPaymentAttempts.id })
            .from(ticketPaymentAttempts)
            .where(eq(ticketPaymentAttempts.bookingId, ticketBookings.id)),
        ),
      ),
    );
}
export async function ticketInventory(
  db: Pick<Tx, "select">,
  salesId: string,
  excluding?: string,
) {
  const [result] = await db
    .select({
      issued: sql<number>`coalesce(sum(case when ${ticketBookings.status} in ('paid','issued') then ${ticketBookings.quantity} else 0 end),0)::int`,
      held: sql<number>`coalesce(sum(case when ${ticketBookings.status} = 'pending' and (${ticketBookings.holdUntil} > now() or exists (select 1 from ${ticketPaymentAttempts} where ${ticketPaymentAttempts.bookingId} = ${sql.identifier("ticket_bookings")}.${sql.identifier("id")} and ${ticketPaymentAttempts.active})) then ${ticketBookings.quantity} else 0 end),0)::int`,
    })
    .from(ticketBookings)
    .where(
      and(
        eq(ticketBookings.salesId, salesId),
        excluding ? ne(ticketBookings.id, excluding) : undefined,
      ),
    );
  return result ?? { issued: 0, held: 0 };
}
export async function saveTicketSale(raw: unknown, actorId: string) {
  const input = ticketSettingsSchema.parse(raw);
  return getDb().transaction(async (tx) => {
    // The cycle lock serializes first-time configuration without a missing-row race.
    const [cycle] = await tx
      .select()
      .from(awardCycles)
      .where(eq(awardCycles.id, input.cycleId))
      .for("update");
    if (!cycle) throw new TicketError("Award cycle not found.");
    const [old] = await tx
      .select()
      .from(ticketSales)
      .where(eq(ticketSales.cycleId, input.cycleId))
      .for("update");
    if ((old?.revision ?? 0) !== input.revision)
      throw new TicketError("Settings changed. Refresh and try again.");
    if (input.status === "open") {
      const [other] = await tx
        .select({ id: ticketSales.id })
        .from(ticketSales)
        .where(
          and(
            eq(ticketSales.status, "open"),
            ne(ticketSales.cycleId, input.cycleId),
          ),
        )
        .limit(1);
      if (other)
        throw new TicketError("Close the other cycle's ticket sales first.");
    }
    if (old) {
      await expireUnstarted(tx, old.id);
      const stock = await ticketInventory(tx, old.id);
      if (input.capacity < stock.issued + stock.held)
        throw new TicketError(
          `Capacity must be at least ${stock.issued + stock.held}, including reserved tickets.`,
        );
      const [hasBooking] = await tx
        .select({ id: ticketBookings.id })
        .from(ticketBookings)
        .where(eq(ticketBookings.salesId, old.id))
        .limit(1);
      if (
        hasBooking &&
        (old.title !== input.title ||
          old.venue !== input.venue ||
          old.eventAt?.toISOString() !== input.eventAt)
      )
        throw new TicketError(
          "Event details are locked after a booking. Price and capacity can still change.",
        );
    }
    const values = {
      ...input,
      revision: input.revision + 1,
      eventAt: input.eventAt ? new Date(input.eventAt) : null,
      updatedAt: new Date(),
    };
    const [saved] = old
      ? await tx
          .update(ticketSales)
          .set(values)
          .where(eq(ticketSales.id, old.id))
          .returning()
      : await tx.insert(ticketSales).values(values).returning();
    await tx.insert(auditLogs).values({
      actorType: "staff",
      actorProfileId: actorId,
      action: "ticket_sales.updated",
      entityType: "ticket_sales",
      entityId: saved.id,
      beforeRedacted: old
        ? {
            status: old.status,
            capacity: old.capacity,
            unitPriceMinor: old.unitPriceMinor,
          }
        : null,
      afterRedacted: {
        status: saved.status,
        capacity: saved.capacity,
        unitPriceMinor: saved.unitPriceMinor,
      },
    });
    return saved;
  });
}
export async function reserveTickets(raw: unknown) {
  const input = ticketBookingSchema.parse(raw);
  const { secret, ...payload } = input;
  const payloadHash = ticketHash(JSON.stringify(payload));
  return getDb().transaction(async (tx) => {
    const sale = await lockTicketSale(tx, input.salesId);
    const [existing] = await tx
      .select()
      .from(ticketBookings)
      .where(eq(ticketBookings.id, input.id))
      .for("update");
    if (existing) {
      if (
        !ticketSecretMatches(secret, existing.accessHash) ||
        existing.payloadHash !== payloadHash
      )
        throw new TicketError(
          "This booking request changed. Refresh and try again.",
        );
      return existing;
    }
    if (sale.status !== "open" || !sale.eventAt || sale.eventAt <= new Date())
      throw new TicketError("Ticket sales are closed.");
    if (sale.unitPriceMinor !== input.acceptedUnitPriceMinor)
      throw new TicketError(
        "The ticket price changed. Refresh to see the current price.",
      );
    if (input.quantity > sale.maxPerBooking)
      throw new TicketError(`Choose up to ${sale.maxPerBooking} tickets.`);
    await expireUnstarted(tx, sale.id);
    const stock = await ticketInventory(tx, sale.id);
    if (stock.issued + stock.held + input.quantity > sale.capacity)
      throw new TicketError(
        "Not enough tickets remain. Refresh and choose fewer tickets.",
      );
    const [booking] = await tx
      .insert(ticketBookings)
      .values({
        id: input.id,
        salesId: sale.id,
        reference: `GBT-${randomBytes(6).toString("hex").toUpperCase()}`,
        accessHash: ticketHash(secret),
        payloadHash,
        name: input.name,
        email: input.email,
        phone: input.phone,
        businessName: input.businessName || null,
        quantity: input.quantity,
        unitPriceMinor: sale.unitPriceMinor,
        amountMinor: sale.unitPriceMinor * input.quantity,
        currency: sale.currency,
        eventTitle: sale.title,
        eventAt: sale.eventAt,
        venue: sale.venue,
        holdUntil: new Date(Date.now() + TICKET_DETAILS_MS),
      })
      .returning();
    return booking;
  });
}
export async function issueBookingTickets(tx: Tx, booking: TicketBooking) {
  await tx
    .insert(guestTickets)
    .values(
      Array.from({ length: booking.quantity }, (_, i) => ({
        bookingId: booking.id,
        position: i + 1,
        code: `GT-${randomBytes(8).toString("hex").toUpperCase()}`,
      })),
    )
    .onConflictDoNothing({
      target: [guestTickets.bookingId, guestTickets.position],
    });
  await tx
    .insert(emailOutbox)
    .values({
      templateKey: "guest_tickets",
      recipientEmail: booking.email,
      applicationId: booking.applicationId,
      payload: { bookingId: booking.id },
      idempotencyKey: `guest-tickets:${booking.id}:initial`,
    })
    .onConflictDoNothing({ target: emailOutbox.idempotencyKey });
}
export const complimentarySchema = z.object({
  requestId: z.uuid(),
  salesId: z.uuid(),
  applicationId: z.uuid(),
  quantity: z.number().int().min(1).max(20),
  reason: z.string().trim().min(3).max(300),
});
export async function issueComplimentaryTickets(raw: unknown, actorId: string) {
  const input = complimentarySchema.parse(raw);
  const payloadHash = ticketHash(JSON.stringify({ ...input, actorId }));
  return getDb().transaction(async (tx) => {
    const sale = await lockTicketSale(tx, input.salesId);
    const [existing] = await tx
      .select()
      .from(ticketBookings)
      .where(eq(ticketBookings.id, input.requestId));
    if (existing) {
      if (existing.payloadHash !== payloadHash || existing.issuedBy !== actorId)
        throw new TicketError("This request has already been used.");
      return existing;
    }
    if (
      !sale.eventAt ||
      sale.eventAt <= new Date() ||
      !sale.venue ||
      !sale.capacity
    )
      throw new TicketError("Set the event date, venue and capacity first.");
    const [application] = await tx
      .select()
      .from(applications)
      .where(
        submittedApplications(
          eq(applications.id, input.applicationId),
          eq(applications.cycleId, sale.cycleId),
        ),
      )
      .for("update");
    if (!application)
      throw new TicketError("Choose a submitted application from this cycle.");
    await expireUnstarted(tx, sale.id);
    const stock = await ticketInventory(tx, sale.id);
    if (stock.issued + stock.held + input.quantity > sale.capacity)
      throw new TicketError("Increase capacity before issuing more tickets.");
    const [booking] = await tx
      .insert(ticketBookings)
      .values({
        id: input.requestId,
        salesId: sale.id,
        applicationId: application.id,
        reference: `GBT-${randomBytes(6).toString("hex").toUpperCase()}`,
        accessHash: ticketHash(randomBytes(32).toString("hex")),
        payloadHash,
        name: application.nomineeName,
        email: application.emailNormalised,
        phone: application.phoneE164 ?? application.phoneDisplay,
        quantity: input.quantity,
        unitPriceMinor: 0,
        amountMinor: 0,
        currency: sale.currency,
        eventTitle: sale.title,
        eventAt: sale.eventAt,
        venue: sale.venue,
        status: "issued",
        source: "staff",
        issuedBy: actorId,
        internalReason: input.reason,
        holdUntil: new Date(),
        confirmedAt: new Date(),
      })
      .returning();
    await issueBookingTickets(tx, booking);
    await tx.insert(auditLogs).values({
      actorType: "staff",
      actorProfileId: actorId,
      action: "tickets.complimentary_issued",
      entityType: "ticket_booking",
      entityId: booking.id,
      applicationId: application.id,
      reason: input.reason,
      afterRedacted: { quantity: input.quantity },
    });
    return booking;
  });
}
export async function getTicketBooking(id: string) {
  const [booking] = await getDb()
    .select()
    .from(ticketBookings)
    .where(eq(ticketBookings.id, id))
    .limit(1);
  if (!booking) throw new TicketError("Booking not found.");
  const [tickets, attempts] = await Promise.all([
    getDb()
      .select()
      .from(guestTickets)
      .where(eq(guestTickets.bookingId, id))
      .orderBy(asc(guestTickets.position)),
    getDb()
      .select()
      .from(ticketPaymentAttempts)
      .where(eq(ticketPaymentAttempts.bookingId, id))
      .limit(1),
  ]);
  return { booking, tickets, attempt: attempts[0], serverNow: Date.now() };
}
// Call only behind staff authorization. QR codes themselves contain no guest data.
export async function getTicketAdmission(id: string) {
  const [row] = await getDb()
    .select({
      ticket: guestTickets,
      booking: ticketBookings,
      application: {
        id: applications.id,
        reference: applications.reference,
        nomineeName: applications.nomineeName,
        category: applications.categoryNameSnapshot,
        nomination: applications.awardNomination,
      },
    })
    .from(guestTickets)
    .innerJoin(ticketBookings, eq(ticketBookings.id, guestTickets.bookingId))
    .leftJoin(
      applications,
      nonDeletedApplications(eq(applications.id, ticketBookings.applicationId)),
    )
    .where(eq(guestTickets.id, z.uuid().parse(id)))
    .limit(1);
  if (!row)
    throw new TicketError(
      "Ticket not found. Check that this is a GBE guest ticket.",
    );
  const { ticket, booking, application } = row;
  return {
    id: ticket.id,
    code: ticket.code,
    position: ticket.position,
    quantity: booking.quantity,
    bookingId: booking.id,
    bookingReference: booking.reference,
    complimentary: booking.source === "staff",
    name: booking.name,
    email: booking.email,
    phone: booking.phone,
    businessName: booking.businessName,
    eventTitle: booking.eventTitle,
    eventAt: booking.eventAt.toISOString(),
    venue: booking.venue,
    status:
      ticket.voidedAt || !["paid", "issued"].includes(booking.status)
        ? ("invalid" as const)
        : ticket.checkedInAt
          ? ("used" as const)
          : ("valid" as const),
    checkedInAt: ticket.checkedInAt?.toISOString() ?? null,
    application,
  };
}
export type TicketAdmission = Awaited<ReturnType<typeof getTicketAdmission>>;

export async function linkTicketBooking(input: unknown, actorId: string) {
  const data = z
    .object({
      bookingId: z.uuid(),
      applicationId: z.uuid().nullable(),
      expectedApplicationId: z.uuid().nullable(),
    })
    .parse(input);
  const { booking } = await getTicketBooking(data.bookingId);
  return getDb().transaction(async (tx) => {
    const sale = await lockTicketSale(tx, booking.salesId);
    const [current] = await tx
      .select()
      .from(ticketBookings)
      .where(eq(ticketBookings.id, booking.id))
      .for("update");
    if (current.source !== "public")
      throw new TicketError(
        "Complimentary tickets stay linked to the application they were issued for.",
      );
    if (current.applicationId === data.applicationId) return;
    if (current.applicationId !== data.expectedApplicationId)
      throw new TicketError(
        "This booking's application link changed. Refresh and try again.",
      );
    if (data.applicationId) {
      const [application] = await tx
        .select({ id: applications.id })
        .from(applications)
        .where(
          submittedApplications(
            and(
              eq(applications.id, data.applicationId),
              eq(applications.cycleId, sale.cycleId),
            ),
          ),
        )
        .for("update");
      if (!application)
        throw new TicketError(
          "Choose a submitted application from this award cycle.",
        );
    }
    await tx
      .update(ticketBookings)
      .set({ applicationId: data.applicationId, updatedAt: new Date() })
      .where(eq(ticketBookings.id, booking.id));
    await tx.insert(auditLogs).values({
      actorType: "staff",
      actorProfileId: actorId,
      action: "ticket_booking.application_linked",
      entityType: "ticket_booking",
      entityId: booking.id,
      applicationId: data.applicationId,
      beforeRedacted: { applicationId: current.applicationId },
      afterRedacted: { applicationId: data.applicationId },
    });
  });
}

export async function checkInTicket(id: string, actorId: string) {
  const [found] = await getDb()
    .select({ ticket: guestTickets, booking: ticketBookings })
    .from(guestTickets)
    .innerJoin(ticketBookings, eq(ticketBookings.id, guestTickets.bookingId))
    .where(eq(guestTickets.id, z.uuid().parse(id)));
  if (!found) throw new TicketError("Ticket not found.");
  return getDb().transaction(async (tx) => {
    await lockTicketSale(tx, found.booking.salesId);
    const [booking] = await tx
      .select()
      .from(ticketBookings)
      .where(eq(ticketBookings.id, found.booking.id))
      .for("update");
    const [ticket] = await tx
      .select()
      .from(guestTickets)
      .where(eq(guestTickets.id, id))
      .for("update");
    if (
      !ticket ||
      ticket.voidedAt ||
      !["paid", "issued"].includes(booking.status)
    )
      throw new TicketError("This ticket is not valid for admission.");
    if (ticket.checkedInAt)
      throw new TicketError("This guest has already checked in.");
    await tx
      .update(guestTickets)
      .set({ checkedInAt: new Date(), checkedInBy: actorId })
      .where(eq(guestTickets.id, id));
    await tx.insert(auditLogs).values({
      actorType: "staff",
      actorProfileId: actorId,
      action: "ticket.checked_in",
      entityType: "guest_ticket",
      entityId: id,
    });
  });
}
export async function cancelComplimentaryTickets(
  id: string,
  actorId: string,
  reason: string,
) {
  const { booking } = await getTicketBooking(z.uuid().parse(id));
  const note = z.string().trim().min(3).max(300).parse(reason);
  await getDb().transaction(async (tx) => {
    await lockTicketSale(tx, booking.salesId);
    const [locked] = await tx
      .select()
      .from(ticketBookings)
      .where(eq(ticketBookings.id, id))
      .for("update");
    if (locked.source !== "staff" || locked.status !== "issued")
      throw new TicketError(
        "Only unused complimentary bookings can be cancelled here.",
      );
    const tickets = await tx
      .select()
      .from(guestTickets)
      .where(eq(guestTickets.bookingId, id))
      .for("update");
    if (tickets.some((ticket) => ticket.checkedInAt))
      throw new TicketError(
        "A guest has already checked in. This booking cannot be cancelled.",
      );
    await tx
      .update(guestTickets)
      .set({ voidedAt: new Date() })
      .where(eq(guestTickets.bookingId, id));
    await tx
      .update(ticketBookings)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(ticketBookings.id, id));
    await tx.insert(auditLogs).values({
      actorType: "staff",
      actorProfileId: actorId,
      action: "tickets.cancelled",
      entityType: "ticket_booking",
      entityId: id,
      reason: note,
    });
  });
}
export async function resendTicketEmail(
  id: string,
  requestId: string,
  actorId: string,
) {
  const { booking } = await getTicketBooking(z.uuid().parse(id));
  await getDb().transaction(async (tx) => {
    await lockTicketSale(tx, booking.salesId);
    const [locked] = await tx
      .select()
      .from(ticketBookings)
      .where(eq(ticketBookings.id, id))
      .for("update");
    if (!["paid", "issued"].includes(locked.status))
      throw new TicketError("Tickets have not been issued for this booking.");
    await tx
      .insert(emailOutbox)
      .values({
        templateKey: "guest_tickets",
        recipientEmail: locked.email,
        applicationId: locked.applicationId,
        payload: { bookingId: id },
        idempotencyKey: `guest-tickets:${id}:resend:${z.uuid().parse(requestId)}`,
      })
      .onConflictDoNothing({ target: emailOutbox.idempotencyKey });
    await tx.insert(auditLogs).values({
      actorType: "staff",
      actorProfileId: actorId,
      action: "tickets.email_requested",
      entityType: "ticket_booking",
      entityId: id,
    });
  });
}
export async function expireTicketHolds(salesId?: string) {
  const sales = await getDb()
    .selectDistinct({ id: ticketBookings.salesId })
    .from(ticketBookings)
    .where(
      and(
        eq(ticketBookings.status, "pending"),
        lt(ticketBookings.holdUntil, new Date()),
        salesId ? eq(ticketBookings.salesId, salesId) : undefined,
        notExists(
          getDb()
            .select({ id: ticketPaymentAttempts.id })
            .from(ticketPaymentAttempts)
            .where(eq(ticketPaymentAttempts.bookingId, ticketBookings.id)),
        ),
      ),
    )
    .limit(20);
  for (const sale of sales)
    await getDb().transaction(async (tx) => {
      await lockTicketSale(tx, sale.id);
      await expireUnstarted(tx, sale.id);
    });
  return sales;
}
