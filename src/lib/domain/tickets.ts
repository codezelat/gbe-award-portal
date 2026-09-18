import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";

export const ticketStatuses = [
  "pending",
  "paid",
  "issued",
  "expired",
  "cancelled",
  "review",
  "refunded",
] as const;
export const ticketStatusLabel = {
  pending: "Awaiting payment",
  paid: "Paid",
  issued: "Complimentary",
  expired: "Expired",
  cancelled: "Cancelled",
  review: "Needs review",
  refunded: "Refunded",
};
export const ticketContactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(160),
  email: z.email().trim().toLowerCase().max(254),
  phone: z
    .string()
    .trim()
    .max(40)
    .transform((value, ctx) => {
      const phone = parsePhoneNumberFromString(value, "LK");
      if (!phone?.isValid()) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid contact number.",
        });
        return z.NEVER;
      }
      return phone.number;
    }),
  businessName: z.string().trim().max(200).optional().default(""),
  quantity: z.number().int().min(1).max(20),
});
export const ticketBookingSchema = ticketContactSchema.extend({
  id: z.uuid(),
  secret: z.string().regex(/^[a-f0-9]{64}$/),
  salesId: z.uuid(),
  acceptedUnitPriceMinor: z.number().int().positive(),
});
export const ticketSettingsSchema = z
  .object({
    cycleId: z.uuid(),
    revision: z.number().int().min(0),
    title: z.string().trim().min(2).max(160),
    capacity: z.number().int().min(0).max(100000),
    unitPriceMinor: z.number().int().min(0).max(100000000),
    maxPerBooking: z.number().int().min(1).max(20),
    venue: z.string().trim().max(240),
    eventAt: z.iso.datetime().nullable(),
    status: z.enum(["draft", "open", "paused", "closed"]),
  })
  .superRefine((value, ctx) => {
    if (
      value.status === "open" &&
      (!value.capacity ||
        !value.unitPriceMinor ||
        !value.venue ||
        !value.eventAt ||
        new Date(value.eventAt) <= new Date())
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Add a price, capacity, future event date and venue before launching.",
      });
  });
export function ticketMoney(minor: number, currency = "LKR") {
  return `${currency} ${(minor / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
}
export function ticketError(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? "Check your details.";
  if (
    error instanceof Error &&
    error.name === "Error" &&
    !error.cause &&
    !error.message.startsWith("NEXT_") &&
    !error.message.startsWith("Failed query")
  )
    return error.message;
  return "This could not be completed. Please retry or contact the GBE Awards team.";
}
