import { describe, expect, it } from "vitest";
import {
  applicantVisibleStatus,
  isOutcomeReleased,
} from "@/lib/domain/outcome-visibility";

describe("applicant outcome visibility", () => {
  const now = new Date("2026-07-11T10:00:00.000Z");

  it("masks outcome states until the configured release instant", () => {
    expect(
      applicantVisibleStatus(
        "winner",
        new Date("2026-07-12T10:00:00.000Z"),
        now,
      ),
    ).toBe("entry_confirmed");
    expect(applicantVisibleStatus("shortlisted", null, now)).toBe(
      "entry_confirmed",
    );
  });

  it("reveals outcomes at and after the release instant", () => {
    const release = new Date("2026-07-11T10:00:00.000Z");
    expect(isOutcomeReleased(release, now)).toBe(true);
    expect(applicantVisibleStatus("winner", release, now)).toBe("winner");
  });

  it("does not alter non-outcome workflow states", () => {
    expect(applicantVisibleStatus("changes_requested", null, now)).toBe(
      "changes_requested",
    );
  });

  it("keeps outcomes masked when the visibility kill switch is disabled", () => {
    expect(
      applicantVisibleStatus(
        "winner",
        new Date("2026-07-10T10:00:00.000Z"),
        now,
        false,
      ),
    ).toBe("entry_confirmed");
  });
});
