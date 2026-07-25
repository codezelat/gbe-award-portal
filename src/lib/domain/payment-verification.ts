export type PaymentVerificationRecord = {
  applicationReference: string | null;
  applicationSubmittedAt: Date | null;
  paymentReference: string | null;
  proofApplicationFileId: string | null;
  payerName: string | null;
  bankReference: string | null;
  amountMinor: number | null;
  currency: string | null;
  paidAt: Date | null;
};

export function missingPaymentVerificationFields(
  record: PaymentVerificationRecord,
) {
  const missing: string[] = [];
  if (!record.applicationReference || !record.applicationSubmittedAt)
    missing.push("completed nomination");
  if (!record.paymentReference) missing.push("payment reference");
  if (!record.proofApplicationFileId) missing.push("payment proof");
  if (!record.payerName) missing.push("payer name");
  if (!record.bankReference) missing.push("bank reference");
  if (record.amountMinor === null || record.amountMinor <= 0)
    missing.push("paid amount");
  if (!record.currency) missing.push("currency");
  if (!record.paidAt) missing.push("paid date");
  return missing;
}

export function paymentVerificationError(record: PaymentVerificationRecord) {
  const missing = missingPaymentVerificationFields(record);
  return missing.length
    ? `Cannot verify this payment until the following are recorded: ${missing.join(", ")}.`
    : null;
}

export function canPurgeIncompletePaymentShell(
  record: PaymentVerificationRecord & {
    workflowStatus: string;
  },
) {
  return (
    record.workflowStatus === "uploading" &&
    !record.applicationReference &&
    !record.applicationSubmittedAt &&
    !record.paymentReference &&
    !record.proofApplicationFileId &&
    !record.payerName &&
    !record.bankReference &&
    record.amountMinor === null &&
    !record.paidAt
  );
}
