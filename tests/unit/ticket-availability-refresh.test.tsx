import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TicketAvailabilityRefresh } from "../../src/components/tickets/availability-refresh";

const { refresh, router } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { refresh, router: { refresh } };
});
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  refresh.mockReset();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("ticket availability expiry refresh", () => {
  it("refreshes only once per known deadline and cleans up", () => {
    const { rerender, unmount } = render(
      <TicketAvailabilityRefresh refreshAt={105000} serverNow={100000} />,
    );
    act(() => vi.advanceTimersByTime(6499));
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(
      <TicketAvailabilityRefresh refreshAt={105000} serverNow={106500} />,
    );
    act(() => vi.advanceTimersByTime(60000));
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(
      <TicketAvailabilityRefresh refreshAt={180000} serverNow={166500} />,
    );
    unmount();
    act(() => vi.advanceTimersByTime(60000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("refreshes on return from a hidden tab without polling", () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    render(<TicketAvailabilityRefresh refreshAt={105000} serverNow={100000} />);
    act(() => vi.advanceTimersByTime(20000));
    expect(refresh).not.toHaveBeenCalled();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("does not start a timer when no reservation is expiring", () => {
    render(<TicketAvailabilityRefresh refreshAt={null} serverNow={100000} />);
    act(() => vi.advanceTimersByTime(3600000));
    expect(refresh).not.toHaveBeenCalled();
  });
});
