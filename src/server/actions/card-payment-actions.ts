"use server";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { paymentAttempts, payments } from "@/lib/db/schema";
import { requireStaff, hasPermission } from "@/server/dal/auth";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { reconcileCardAttempt } from "@/server/services/card-payments";
import { paymentErrorMessage } from "@/lib/domain/genie";

export async function checkCardPaymentAction(
  _previous: { message: string; ok: boolean },
  form: FormData,
) {
  try {
    const { profile, membership } = await requireStaff();
    if (!hasPermission(membership, "payments.verify"))
      throw new Error("Payment review permission is required.");
    const input = z
      .object({
        applicationId: z.uuid(),
        transactionId: z
          .string()
          .trim()
          .regex(/^(?:[a-f0-9]{24})?$/i)
          .default(""),
      })
      .parse(Object.fromEntries(form));
    await enforceRateLimit(`staff-card-check:${profile.id}`, 30, 900);
    const [row] = await getDb()
      .select({ attempt: paymentAttempts })
      .from(paymentAttempts)
      .innerJoin(payments, eq(payments.id, paymentAttempts.paymentId))
      .where(eq(payments.applicationId, input.applicationId))
      .orderBy(desc(paymentAttempts.createdAt))
      .limit(1);
    if (!row)
      throw new Error("The applicant has not started card checkout yet.");
    if (!row.attempt.transactionId && !input.transactionId)
      throw new Error(
        "Find the transaction in Genie using the attempt reference, then enter its transaction ID.",
      );
    await reconcileCardAttempt(
      row.attempt.id,
      input.transactionId || undefined,
    );
    revalidatePath("/admin/payments");
    revalidatePath(`/admin/applications/${input.applicationId}`);
    revalidatePath("/portal/payment");
    revalidatePath("/admin", "layout");
    revalidatePath("/portal", "layout");
    return { ok: true, message: "Payment status checked with Genie." };
  } catch (error) {
    return { ok: false, message: paymentErrorMessage(error) };
  }
}
