export const activatableInvitationStatuses = ["pending", "sent"] as const;

export function isInvitationActivatable(status: string) {
  return activatableInvitationStatuses.includes(
    status as (typeof activatableInvitationStatuses)[number],
  );
}
