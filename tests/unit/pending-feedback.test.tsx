import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/admin",
  search: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.search,
}));

import { GlobalPendingIndicator } from "@/components/shared/global-pending-indicator";
import { Button } from "@/components/ui/button";

afterEach(() => {
  vi.useRealTimers();
  navigation.pathname = "/admin";
  navigation.search = new URLSearchParams();
});

describe("pending interaction feedback", () => {
  it("locks a loading button and exposes an accessible busy state", () => {
    render(
      <Button loading loadingLabel="Saving">
        Save changes
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-pending", "true");
  });

  it("delays navigation feedback, locks the clicked link and clears on arrival", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <>
        <GlobalPendingIndicator />
        <a href="/__pending-test__">Payments</a>
      </>,
    );
    const link = screen.getByRole("link", { name: "Payments" });
    const indicator = screen.getByTestId("global-pending-indicator");
    const preventNavigation = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("click", preventNavigation);

    fireEvent.click(link);
    window.removeEventListener("click", preventNavigation);
    expect(link).toHaveAttribute("aria-busy", "true");
    expect(indicator).toHaveAttribute("aria-hidden", "true");

    act(() => vi.advanceTimersByTime(130));
    expect(indicator).toHaveAttribute("aria-hidden", "false");

    navigation.pathname = "/__pending-test__";
    rerender(
      <>
        <GlobalPendingIndicator />
        <a href="/__pending-test__">Payments</a>
      </>,
    );
    expect(indicator).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link", { name: "Payments" })).not.toHaveAttribute(
      "data-navigation-pending",
    );
  });
});
