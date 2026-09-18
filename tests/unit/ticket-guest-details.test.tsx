import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TicketGuestDetails } from "@/components/admin/ticket-guest-details";
import type { TicketAdmission } from "@/server/services/tickets";

afterEach(cleanup);
const ticket: TicketAdmission = {
  id: "ticket",
  code: "GT-123",
  position: 1,
  quantity: 2,
  bookingId: "booking",
  bookingReference: "GBT-123",
  complimentary: false,
  name: "Guest Name",
  email: "guest@example.test",
  phone: "+94771234567",
  businessName: "Guest Company",
  eventTitle: "Awards",
  eventAt: "2026-11-20T12:30:00Z",
  venue: "Colombo",
  status: "valid",
  checkedInAt: null,
  application: {
    id: "application",
    reference: "GBE-2026-123456",
    nomineeName: "Nominee Company",
    category: "Business",
    nomination: "Regional growth",
  },
};
it("shows compact guest, booking and linked nomination details", () => {
  render(<TicketGuestDetails ticket={ticket} />);
  expect(screen.getByRole("link", { name: ticket.phone })).toHaveAttribute(
    "href",
    "tel:+94771234567",
  );
  expect(screen.getByText("Paid")).toBeInTheDocument();
  expect(screen.getByText("Nominee Company")).toBeInTheDocument();
  expect(screen.getByText("Business")).toBeInTheDocument();
  expect(screen.getByText("Regional growth")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "GBE-2026-123456" })).toHaveAttribute(
    "target",
    "_blank",
  );
  expect(screen.getByRole("link", { name: "Booking GBT-123" })).toHaveAttribute(
    "href",
    "/admin/tickets/booking",
  );
});
it("keeps long nomination text expandable on every viewport", () => {
  const nomination = "A longer nomination. ".repeat(20);
  const { container } = render(
    <TicketGuestDetails
      ticket={{
        ...ticket,
        application: { ...ticket.application!, nomination },
      }}
    />,
  );
  const details = container.querySelector("details")!;
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Award nomination"));
  expect(details).toHaveAttribute("open");
  expect(details).toHaveTextContent(nomination.trim());
});
it("does not render application data when it has been removed by authorization", () => {
  render(
    <TicketGuestDetails
      ticket={{ ...ticket, application: null, complimentary: true }}
    />,
  );
  expect(screen.queryByText("Nominee Company")).not.toBeInTheDocument();
  expect(screen.getByText("Complimentary")).toBeInTheDocument();
});
