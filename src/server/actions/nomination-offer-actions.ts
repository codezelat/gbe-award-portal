"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { hasPermission, requireStaff } from "@/server/dal/auth";
import { assertSameOrigin } from "@/server/security/request";
import {
  nominationOfferSchema,
  parseOfferAmount,
  parseOfferLocalTime,
} from "@/lib/validation/nomination-offer";
import {
  OfferConflictError,
  saveNominationOffer,
} from "@/server/services/nomination-offers";

export type OfferActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export async function saveNominationOfferAction(
  _previous: OfferActionState,
  data: FormData,
): Promise<OfferActionState> {
  await assertSameOrigin();
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "configuration.manage"))
    return {
      status: "error",
      message: "Only a super admin can change nomination offers.",
    };
  try {
    const text = (key: string) => String(data.get(key) ?? "");
    const cycleId = z.uuid().parse(text("cycleId"));
    const expectedRevision = z
      .union([z.literal(""), z.uuid()])
      .parse(text("revision"));
    const offer = nominationOfferSchema.parse({
      enabled: data.get("enabled") === "on",
      currency: text("currency"),
      startsAt: parseOfferLocalTime(text("startsAt")),
      endsAt: parseOfferLocalTime(text("endsAt")),
      amountMinor: parseOfferAmount(text("amount")),
      standardAmountMinor: parseOfferAmount(text("standardAmount")),
      bannerText: text("bannerText"),
    });
    await saveNominationOffer({
      cycleId,
      expectedRevision,
      offer,
      actorId: profile.id,
    });
    revalidatePath("/admin/cycles");
    revalidatePath("/apply");
    return { status: "success", message: "Offer saved." };
  } catch (error) {
    if (error instanceof OfferConflictError) {
      revalidatePath("/admin/cycles");
      return { status: "error", message: error.message };
    }
    return {
      status: "error",
      message:
        error instanceof z.ZodError
          ? (error.issues.find((issue) => issue.code === "custom")?.message ??
            "Check the fees, wording and dates.")
          : "Could not save the offer. Please try again.",
    };
  }
}
