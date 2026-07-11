export type EmailTemplateCopy = {
  title: string;
  message: string;
  actionLabel?: string;
};

export const emailTemplateDefaults: Record<string, EmailTemplateCopy> = {
  nomination_received: {
    title: "Your GBE Awards nomination has been received",
    message:
      "Your nomination is safely recorded and will now enter administrative review.",
  },
  admin_nomination_received: {
    title: "New GBE Awards nomination",
    message: "A new nomination is ready for administrative review.",
    actionLabel: "Review nomination",
  },
  application_under_review: {
    title: "Your GBE Awards nomination is under review",
    message:
      "The GBE Awards team has started reviewing your submitted nomination.",
    actionLabel: "View nomination status",
  },
  application_changes_requested: {
    title: "Action required for your GBE Awards nomination",
    message:
      "The GBE Awards team needs additional information. Sign in to review the exact request and deadline.",
    actionLabel: "Review requested updates",
  },
  application_resubmitted: {
    title: "Your nomination updates were received",
    message:
      "The requested updates have been safely received and returned to the review team.",
    actionLabel: "View nomination",
  },
  updates_received: {
    title: "Requested nomination updates received",
    message:
      "The applicant submitted the requested updates. The revised version is ready for review.",
    actionLabel: "Review updates",
  },
  application_approved: {
    title: "Your GBE Awards nomination has been approved",
    message:
      "Your nomination has been approved for secure applicant portal access. Follow the separate activation invitation if your account is not yet active.",
    actionLabel: "View nomination",
  },
  application_rejected: {
    title: "Update on your GBE Awards nomination",
    message:
      "The review of your nomination is complete. Sign in to see the applicant-facing decision and any message from the team.",
    actionLabel: "View decision",
  },
  application_entry_confirmed: {
    title: "Your GBE Awards entry is confirmed",
    message:
      "The required nomination and payment checks are complete and your entry is confirmed.",
    actionLabel: "View confirmed entry",
  },
  application_shortlisted: {
    title: "Your GBE Awards nomination is shortlisted",
    message:
      "Congratulations. Your nomination has been selected for the GBE Awards shortlist.",
    actionLabel: "View outcome",
  },
  application_winner: {
    title: "Congratulations from the GBE Awards",
    message:
      "Your nomination has received a winning outcome. Sign in to view the official update.",
    actionLabel: "View winning outcome",
  },
  application_not_selected: {
    title: "Your GBE Awards outcome is available",
    message:
      "The outcome for your nomination is now available in the secure portal.",
    actionLabel: "View outcome",
  },
  applicant_invitation: {
    title: "Activate your GBE Awards portal access",
    message:
      "Your nomination has been approved for secure portal access. Activate your invitation before it expires.",
    actionLabel: "Activate portal access",
  },
  existing_account_linked: {
    title: "A nomination was linked to your GBE Awards account",
    message:
      "An approved nomination is now available in your existing secure portal account.",
    actionLabel: "View linked nomination",
  },
  account_application_linked: {
    title: "A nomination was linked to your GBE Awards account",
    message:
      "An authorised administrator linked an approved nomination to your secure portal account.",
    actionLabel: "View linked nomination",
  },
  invitation_reminder: {
    title: "Your GBE Awards invitation is expiring",
    message:
      "Activate your secure portal access before the invitation expires.",
    actionLabel: "Activate portal access",
  },
  invitation_expired: {
    title: "Your GBE Awards invitation expired",
    message:
      "Contact info@gbeaward.com or ask the GBE Awards team to issue a new secure invitation.",
  },
  payment_under_review: {
    title: "Your payment proof is under review",
    message:
      "The GBE Awards finance team has started reviewing your payment evidence.",
    actionLabel: "View payment status",
  },
  payment_verified: {
    title: "Payment proof verified",
    message:
      "Your payment evidence has been verified by the GBE Awards finance team.",
    actionLabel: "View payment confirmation",
  },
  payment_rejected: {
    title: "Replacement payment proof required",
    message:
      "Your payment evidence could not be verified. Sign in to review the reason and upload a replacement.",
    actionLabel: "Review payment request",
  },
  payment_waived: {
    title: "Payment requirement waived",
    message:
      "The GBE Awards team has confirmed that no further payment action is required for this nomination.",
    actionLabel: "View payment status",
  },
  payment_refunded: {
    title: "Payment status updated",
    message:
      "The recorded payment status for your nomination has been updated by an authorised administrator.",
    actionLabel: "View payment status",
  },
  applicant_message: {
    title: "New message from the GBE Awards team",
    message: "A new applicant-visible message is available in your portal.",
    actionLabel: "Read message",
  },
  applicant_message_received: {
    title: "New applicant portal message",
    message: "An applicant has sent a new portal message.",
    actionLabel: "Review message",
  },
  password_reset: {
    title: "Reset your GBE Awards portal password",
    message:
      "Use the secure link below to choose a new password. If you did not request this, you can ignore this email.",
    actionLabel: "Reset password",
  },
  email_verification: {
    title: "Verify your GBE Awards portal email",
    message:
      "Use the secure link below to verify this email address before signing in.",
    actionLabel: "Verify email address",
  },
  account_security_change: {
    title: "Your GBE Awards account security changed",
    message: "A security change was made to your portal account.",
  },
  staff_invitation: {
    title: "GBE Awards staff invitation",
    message:
      "You have been invited to the administration portal. Multi-factor authentication is mandatory.",
    actionLabel: "Accept staff invitation",
  },
};
