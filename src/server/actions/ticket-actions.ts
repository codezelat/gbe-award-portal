"use server";
import { revalidatePath } from "next/cache";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { applications, ticketSales } from "@/lib/db/schema";
import { ticketSettingsSchema } from "@/lib/domain/tickets";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import { submittedApplications } from "@/server/dal/application-visibility";
import { assertSameOrigin } from "@/server/security/request";
import { enforceRateLimit } from "@/server/security/rate-limit";
import {
  cancelComplimentaryTickets,
  complimentarySchema,
  checkInTicket,
  getTicketAdmission,
  linkTicketBooking,
  issueComplimentaryTickets,
  resendTicketEmail,
  saveTicketSale,
  TicketError,
} from "@/server/services/tickets";
import {
  checkTicketPayment,
  refreshExpiredTicketBookings,
} from "@/server/services/ticket-payments";
import { scheduleEmailOutboxProcessing } from "@/server/jobs/schedule-email-delivery";
async function staff(permission: string, admission = false) {
  await assertSameOrigin();
  const actor = await requireStaff();
  if (!hasPermission(actor.membership, permission))
    throw new TicketError("You do not have access to this action.");
  await enforceRateLimit(
    `${admission ? "ticket-admission" : "ticket-staff"}:${actor.profile.id}`,
    admission ? 1200 : 120,
    900,
  );
  return actor;
}
function failure(error: unknown) {
  return {
    ok: false as const,
    message:
      error instanceof TicketError
        ? error.message
        : error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Check the details.")
          : "This action could not be completed. Refresh and try again.",
  };
}
function refresh() {
  revalidatePath("/admin/tickets", "layout");
  revalidatePath("/tickets", "layout");
}
export async function saveTicketSettings(input: unknown) {
  try {
    const {
      profile: { id: actor },
    } = await staff("configuration.manage");
    const parsed = ticketSettingsSchema.parse(input);
    const [sale] = await getDb()
      .select({ id: ticketSales.id })
      .from(ticketSales)
      .where(eq(ticketSales.cycleId, parsed.cycleId))
      .limit(1);
    if (sale) await refreshExpiredTicketBookings(sale.id);
    await saveTicketSale(parsed, actor);
    refresh();
    return { ok: true as const };
  } catch (error) {
    return failure(error);
  }
}
export async function issueGuestTickets(input: unknown) {
  try {
    const {
      profile: { id: actor },
    } = await staff("payments.verify");
    const parsed = complimentarySchema.parse(input);
    await refreshExpiredTicketBookings(parsed.salesId);
    const booking = await issueComplimentaryTickets(parsed, actor);
    scheduleEmailOutboxProcessing();
    refresh();
    return { ok: true as const, id: booking.id };
  } catch (error) {
    return failure(error);
  }
}
export async function findTicketApplications(cycleId: string, query: string) {
  const actor = await staff("payments.verify");
  if (!hasPermission(actor.membership, "applications.view"))
    throw new TicketError("You do not have access to applications.");
  const search = z
    .string()
    .trim()
    .min(2)
    .max(100)
    .parse(query)
    .replace(/[\\%_]/g, "\\$&");
  return getDb()
    .select({
      id: applications.id,
      name: applications.nomineeName,
      email: applications.emailNormalised,
      reference: applications.reference,
    })
    .from(applications)
    .where(
      submittedApplications(
        and(
          eq(applications.cycleId, z.uuid().parse(cycleId)),
          or(
            ilike(applications.nomineeName, `%${search}%`),
            ilike(applications.reference, `%${search}%`),
            ilike(applications.emailNormalised, `%${search}%`),
          ),
        ),
      ),
    )
    .limit(10);
}
export async function manageTicketBooking(input: {
  id: string;
  action: "check" | "resend" | "cancel";
  requestId: string;
  reason?: string;
  transactionId?: string;
}) {
  try {
    const {
      profile: { id: actor },
    } = await staff("payments.verify");
    const id = z.uuid().parse(input.id);
    z.uuid().parse(input.requestId);
    if (input.action === "check")
      await checkTicketPayment(
        id,
        input.transactionId
          ? z
              .string()
              .regex(/^[a-f0-9]{24}$/i)
              .parse(input.transactionId)
          : undefined,
        actor,
      );
    else if (input.action === "resend") {
      await enforceRateLimit(`ticket-resend:${id}`, 3, 3600);
      await resendTicketEmail(id, input.requestId, actor);
      scheduleEmailOutboxProcessing();
    } else if (input.action === "cancel")
      await cancelComplimentaryTickets(id, actor, input.reason ?? "");
    else throw new TicketError("Unknown action.");
    refresh();
    return { ok: true as const };
  } catch (error) {
    return failure(error);
  }
}
export async function admitGuestTicket(id: string) {
  try {
    const {
      profile: { id: actor },
    } = await staff("payments.verify", true);
    await checkInTicket(id, actor);
    refresh();
    return { ok: true as const };
  } catch (error) {
    return failure(error);
  }
}

export async function readGuestTicketForScan(id: string) {
  try {
    const actor = await staff("payments.verify", true);
    const ticket = await getTicketAdmission(id);
    if (!hasPermission(actor.membership, "applications.view"))
      ticket.application = null;
    return { ok: true as const, ticket };
  } catch (error) {
    return failure(error);
  }
}

export async function linkGuestBooking(input: unknown) {
  try {
    const actor = await staff("payments.verify");
    if (!hasPermission(actor.membership, "applications.view"))
      throw new TicketError("You do not have access to applications.");
    await linkTicketBooking(input, actor.profile.id);
    refresh();
    return { ok: true as const };
  } catch (error) {
    return failure(error);
  }
}
