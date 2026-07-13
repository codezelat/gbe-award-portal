import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";
import { declarationText } from "@/config/brand";

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const supportTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const paymentTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
const extensionsByMime: Record<string, readonly string[]> = {
  "application/pdf": ["pdf"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "docx",
  ],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};
export function isExtensionAllowed(name: string, claimedMime: string) {
  const extension = name.includes(".")
    ? name.split(".").at(-1)!.toLowerCase()
    : "";
  return extensionsByMime[claimedMime]?.includes(extension) === true;
}
export function isDetectedTypeAllowed(
  kind: "supporting_document" | "requested_document" | "payment_proof",
  claimed: string,
  detected: string,
) {
  const allowed = kind === "payment_proof" ? paymentTypes : supportTypes;
  if ((allowed as readonly string[]).includes(detected) && claimed === detected)
    return true;
  return (
    kind !== "payment_proof" &&
    claimed === "application/msword" &&
    detected === "application/x-cfb"
  );
}

export function normaliseUrl(value?: string) {
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
export function normalisePhone(value: string) {
  return parsePhoneNumberFromString(value)?.number;
}

export const publicApplicationSchema = z.object({
  nomineeName: z
    .string()
    .trim()
    .min(2, "Enter the nominee or organisation name.")
    .max(180),
  designation: z.string().trim().max(120).optional().or(z.literal("")),
  awardNomination: z
    .string()
    .trim()
    .min(10, "Describe the award nomination.")
    .max(4000),
  businessWebsite: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || z.url().safeParse(normaliseUrl(value)).success,
      "Enter a valid website address.",
    ),
  email: z.email("Enter a valid email address.").max(320),
  phone: z
    .string()
    .trim()
    .min(5, "Enter an international telephone number.")
    .max(40)
    .refine(
      (v) => Boolean(normalisePhone(v)),
      "Enter a valid international telephone number including country code.",
    ),
  categoryId: z.uuid("Choose an award category."),
  declarationAccepted: z
    .boolean()
    .refine((value) => value, "You must accept the nomination declaration."),
  declarationText: z.literal(declarationText),
  turnstileToken: z.string().min(1, "Complete the security verification."),
  honeypot: z.string().max(0),
  startedAt: z.number().int().positive(),
  idempotencyKey: z.uuid(),
});

export const fileManifestItemSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_FILE_SIZE),
  type: z.string(),
  kind: z.enum(["supporting_document", "payment_proof"]),
});
export const initiateApplicationSchema = publicApplicationSchema.extend({
  files: z
    .array(fileManifestItemSchema)
    .max(6)
    .superRefine((files, ctx) => {
      const support = files.filter((f) => f.kind === "supporting_document");
      const payments = files.filter((f) => f.kind === "payment_proof");
      if (support.length > 5)
        ctx.addIssue({
          code: "custom",
          message: "Choose no more than five supporting files.",
        });
      if (payments.length !== 1)
        ctx.addIssue({
          code: "custom",
          message: "Choose exactly one payment proof.",
        });
      for (const file of files) {
        const allowed =
          file.kind === "payment_proof" ? paymentTypes : supportTypes;
        if (
          !(allowed as readonly string[]).includes(file.type) ||
          !isExtensionAllowed(file.name, file.type)
        )
          ctx.addIssue({
            code: "custom",
            message: `${file.name} is not an accepted file type.`,
          });
      }
    }),
});

export type PublicApplicationInput = z.input<typeof publicApplicationSchema>;
