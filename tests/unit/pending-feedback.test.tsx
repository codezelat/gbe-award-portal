import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useActionState } from "react";
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
    expect(button.querySelectorAll('[data-slot="button-spinner"]')).toHaveLength(
      1,
    );
  });

  it("shows one spinner when explicit and native form pending overlap", async () => {
    let complete!: (value: number) => void;
    const request = new Promise<number>((resolve) => {
      complete = resolve;
    });
    const action = vi.fn(() => request);
    function Form() {
      const [, submit, pending] = useActionState(action, 0);
      return (
        <form action={submit}>
          <Button loading={pending}>Check payment</Button>
          <Button type="button">Other action</Button>
        </form>
      );
    }
    render(<Form />);
    const button = screen.getByRole("button", { name: "Check payment" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    expect(button).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Other action" }),
    ).not.toHaveAttribute("aria-busy");
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => complete(1));
    expect(button).toBeEnabled();
    expect(button.querySelector("svg")).toBeNull();
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
