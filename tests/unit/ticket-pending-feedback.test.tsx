import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  issue: vi.fn(),
  manage: vi.fn(),
  admit: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("@/server/actions/ticket-actions", () => ({
  findTicketApplications: mocks.find,
  issueGuestTickets: mocks.issue,
  manageTicketBooking: mocks.manage,
  admitGuestTicket: mocks.admit,
  saveTicketSettings: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import {
  AdmitTicket,
  ComplimentaryTickets,
  TicketBookingActions,
} from "@/components/admin/ticket-controls";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function expectSingleSpinner(button: HTMLElement) {
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(button.querySelectorAll(".animate-spin")).toHaveLength(1);
  expect(button.querySelector('[data-slot="button-spinner"]')).not.toBeNull();
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("ticket action loading feedback", () => {
  it("shows one loader during search and complimentary issuance, blocking duplicate requests", async () => {
    const application = {
      id: "application-fixture",
      name: "Sample Business",
      reference: "GBE-2026-123456",
      email: "guest@example.test",
    };
    const search = deferred<typeof application[]>();
    const issue = deferred<{ ok: boolean; id: string }>();
    mocks.find.mockReturnValue(search.promise);
    mocks.issue.mockReturnValue(issue.promise);
    render(
      <ComplimentaryTickets salesId="sale-fixture" cycleId="cycle-fixture" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Complimentary tickets" }));
    fireEvent.change(screen.getByLabelText("Name, reference or email"), {
      target: { value: "Sample" },
    });
    const searchButton = screen.getByRole("button", {
      name: "Search applications",
    });
    fireEvent.click(searchButton);
    expectSingleSpinner(searchButton);
    fireEvent.click(searchButton);
    expect(mocks.find).toHaveBeenCalledTimes(1);
    await act(async () => search.resolve([application]));
    expect(searchButton).toBeEnabled();
    expect(searchButton.querySelector(".animate-spin")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Sample Business/ }));
    fireEvent.change(screen.getByLabelText("Internal note"), {
      target: { value: "Test fixture only" },
    });
    const issueButton = screen.getByRole("button", {
      name: "Issue and email tickets",
    });
    fireEvent.click(issueButton);
    expectSingleSpinner(issueButton);
    fireEvent.click(issueButton);
    expect(mocks.issue).toHaveBeenCalledTimes(1);
    await act(async () => issue.resolve({ ok: true, id: "booking-fixture" }));
    expect(mocks.push).toHaveBeenCalledWith("/admin/tickets/booking-fixture");
  });

  it("clears the resend loader after a failure and allows a safe retry", async () => {
    const resend = deferred<{ ok: boolean; message: string }>();
    mocks.manage
      .mockReturnValueOnce(resend.promise)
      .mockResolvedValueOnce({ ok: true });
    render(
      <TicketBookingActions
        id="booking-fixture"
        issued
        complimentary
        needsRecovery={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Resend email" }));
    const confirm = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirm);
    expectSingleSpinner(confirm);
    fireEvent.click(confirm);
    expect(mocks.manage).toHaveBeenCalledTimes(1);
    await act(async () =>
      resend.resolve({ ok: false, message: "Please try again." }),
    );
    expect(confirm).toBeEnabled();
    expect(confirm.querySelector(".animate-spin")).toBeNull();
    expect(screen.getByText("Please try again.")).toBeVisible();
    await act(async () => fireEvent.click(confirm));
    expect(mocks.manage).toHaveBeenCalledTimes(2);
    expect(mocks.manage.mock.calls[1][0].requestId).toBe(
      mocks.manage.mock.calls[0][0].requestId,
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows one check-in loader and unlocks after an unexpected error", async () => {
    let reject!: (reason: Error) => void;
    mocks.admit.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    render(<AdmitTicket id="ticket-fixture" />);
    const button = screen.getByRole("button", { name: "Confirm check-in" });
    fireEvent.click(button);
    expectSingleSpinner(button);
    fireEvent.click(button);
    expect(mocks.admit).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("Offline")));
    expect(button).toBeEnabled();
    expect(button.querySelector(".animate-spin")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Check-in could not be confirmed.",
    );
  });
});
