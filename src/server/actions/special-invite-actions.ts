"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import { assertSameOrigin } from "@/server/security/request";
import { enforceRateLimit } from "@/server/security/rate-limit";
import {
  issueSpecialInvites,
  issueInvitesSchema,
  revokeUnusedInvite,
  SpecialInviteError,
} from "@/server/services/special-invites";
import { parseOfferAmount } from "@/lib/validation/nomination-offer";

export async function generateSpecialInvites(input: {
  requestId: string;
  cycleId: string;
  amount: string;
  quantity: number;
}) {
  await assertSameOrigin();
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "configuration.manage"))
    return {
      ok: false as const,
      message: "Only a super admin can issue special invites.",
    };
  try {
    await enforceRateLimit(`invite-issue:${profile.id}`, 30, 3600);
    const data = await issueSpecialInvites(
      issueInvitesSchema.parse({
        ...input,
        discountMinor: parseOfferAmount(input.amount),
      }),
      profile.id,
    );
    revalidatePath("/admin/special-invites");
    return { ok: true as const, ...data };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof SpecialInviteError
          ? error.message
          : error instanceof z.ZodError
            ? "Enter a positive discount and a quantity from 1 to 100."
            : "Could not generate invites. Retry with the same details.",
    };
  }
}

export async function cancelSpecialInvite(id: string) {
  await assertSameOrigin();
  const { profile, membership } = await requireStaff();
  if (!hasPermission(membership, "configuration.manage"))
    return {
      ok: false as const,
      message: "Only a super admin can cancel invites.",
    };
  try {
    await enforceRateLimit(`invite-cancel:${profile.id}`, 100, 3600);
    await revokeUnusedInvite(z.uuid().parse(id), profile.id);
    revalidatePath("/admin/special-invites");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof SpecialInviteError
          ? error.message
          : "Could not cancel this invite. Please retry.",
    };
  }
}
