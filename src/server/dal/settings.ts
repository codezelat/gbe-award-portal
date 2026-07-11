import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
export async function getPublicSetting(key: "legal_terms" | "privacy_notice") {
  if (!process.env.DATABASE_URL) return null;
  const [row] = await getDb()
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return typeof row?.value === "string" ? row.value : null;
}

const paymentInstructionsSchema = z
  .object({
    refundableIfNotAwarded: z.boolean().optional(),
    cardPaymentUrl: z.url().startsWith("https://").optional(),
    bankTransfer: z
      .object({
        accountName: z.string().trim().min(1).max(160),
        bankName: z.string().trim().min(1).max(160),
        accountNumber: z.string().trim().min(1).max(80),
        branchName: z.string().trim().min(1).max(160).optional(),
        bankCode: z.string().trim().min(1).max(40).optional(),
        branchCode: z.string().trim().min(1).max(40).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export async function getPublicPaymentInstructions() {
  if (!process.env.DATABASE_URL) return null;
  const [row] = await getDb()
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "bank_instructions"))
    .limit(1);
  const parsed = paymentInstructionsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}
