import { z } from "zod";
import {
  fileManifestItemSchema,
  isExtensionAllowed,
  paymentTypes,
  publicApplicationSchema,
  supportTypes,
} from "./application";

export const draftCredentialSchema = z.object({
  id: z.uuid(),
  secret: z.string().regex(/^[a-f0-9]{64}$/),
});
export type DraftCredential = z.infer<typeof draftCredentialSchema>;
export const draftDataSchema = publicApplicationSchema
  .pick({
    nomineeName: true,
    designation: true,
    businessWebsite: true,
    email: true,
    phone: true,
    categoryId: true,
    awardNomination: true,
  })
  .partial()
  .extend({
    nomineeName: publicApplicationSchema.shape.nomineeName,
    paymentMethod: z.enum(["bank_transfer", "card"]).optional(),
  });
export type DraftData = z.infer<typeof draftDataSchema>;
export const draftManifestSchema = z
  .array(fileManifestItemSchema)
  .max(6)
  .superRefine((items, ctx) => {
    if (
      new Set(items.map((item) => item.id)).size !== items.length ||
      items.filter((item) => item.kind === "payment_proof").length > 1 ||
      items.filter((item) => item.kind === "supporting_document").length > 5
    )
      ctx.addIssue({ code: "custom", message: "Invalid file selection." });
    for (const item of items) {
      const types = item.kind === "payment_proof" ? paymentTypes : supportTypes;
      if (
        !(types as readonly string[]).includes(item.type) ||
        !isExtensionAllowed(item.name, item.type)
      )
        ctx.addIssue({
          code: "custom",
          message: "Choose a supported file type.",
        });
    }
  });
export const saveDraftSchema = z
  .object({
    credential: draftCredentialSchema,
    cycleId: z.uuid(),
    version: z.number().int().nonnegative(),
    step: z.number().int().min(0).max(3),
    data: draftDataSchema,
    files: draftManifestSchema,
    turnstileToken: z.string().max(2048).optional(),
    honeypot: z.string().max(0),
    startedAt: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    if (
      value.step >= 1 &&
      (!value.data.email ||
        !value.data.phone ||
        !value.data.categoryId ||
        !value.data.awardNomination)
    )
      ctx.addIssue({
        code: "custom",
        message: "Complete the contact and nomination details.",
      });
    if (value.step >= 2 && !value.data.paymentMethod)
      ctx.addIssue({ code: "custom", message: "Choose a payment method." });
    if (value.step === 0 && value.version === 0 && value.files.length)
      ctx.addIssue({
        code: "custom",
        message: "Files belong on the contact and payment steps.",
      });
    if (
      value.data.paymentMethod === "card" &&
      value.files.some((file) => file.kind === "payment_proof")
    )
      ctx.addIssue({
        code: "custom",
        message: "Card payments do not need a payment slip.",
      });
  });
export const draftStepLabels = [
  "Nominee",
  "Contact",
  "Payment",
  "Confirmation",
] as const;
