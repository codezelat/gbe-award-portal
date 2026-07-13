import { describe, expect, it } from "vitest";
import { isInvitationActivatable } from "@/lib/domain/invitations";

describe("invitation acceptance", () => {
  it("accepts invitations after delivery without reopening used or failed links", () => {
    expect(isInvitationActivatable("pending")).toBe(true);
    expect(isInvitationActivatable("sent")).toBe(true);
    expect(isInvitationActivatable("accepted")).toBe(false);
    expect(isInvitationActivatable("expired")).toBe(false);
    expect(isInvitationActivatable("revoked")).toBe(false);
    expect(isInvitationActivatable("failed")).toBe(false);
  });
});
