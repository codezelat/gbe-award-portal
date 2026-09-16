import { z } from "zod";

export const nominationOfferSchema = z
  .object({
    enabled: z.boolean(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    startsAt: z.number().int().min(0).max(7_258_118_400_000),
    endsAt: z.number().int().min(0).max(7_258_118_400_000),
    amountMinor: z.number().int().positive().max(2_000_000_000),
    standardAmountMinor: z.number().int().positive().max(2_000_000_000),
    bannerText: z.string().trim().min(1).max(80),
  })
  .refine((value) => value.endsAt > value.startsAt, {
    message: "End time must be after the start time.",
    path: ["endsAt"],
  })
  .refine((value) => value.amountMinor < value.standardAmountMinor, {
    message: "Offer fee must be lower than the regular fee.",
    path: ["amountMinor"],
  });

export const savedNominationOfferSchema = z.object({
  version: z.literal(1),
  revision: z.uuid(),
  offer: nominationOfferSchema,
});

// Explicit Colombo offset, independent of the browser or Vercel timezone.
export function parseOfferLocalTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
  const timestamp = Date.parse(`${value}:00+05:30`);
  if (!Number.isFinite(timestamp)) return NaN;
  const roundTrip = new Date(timestamp + 330 * 60_000)
    .toISOString()
    .slice(0, 16);
  return roundTrip === value ? timestamp : NaN;
}

export function parseOfferAmount(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
  return Math.round(Number(value) * 100);
}
