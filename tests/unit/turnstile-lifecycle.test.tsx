import React, { StrictMode, useEffect } from "react";
import { render, cleanup, act, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Turnstile } from "@/components/forms/turnstile";

vi.mock("next/script", () => ({
  default: function MockScript({ onReady }: { onReady: () => void }) {
    useEffect(() => {
      onReady();
    }, [onReady]);
    return null;
  },
}));
afterEach(() => {
  cleanup();
  delete window.turnstile;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("recreates cached widgets after strict-mode cleanup and resets only live widgets", () => {
  const active = new Set<string>();
  let sequence = 0;
  window.turnstile = {
    render: vi.fn(() => {
      const id = String(++sequence);
      active.add(id);
      return id;
    }),
    remove: vi.fn((id) => {
      expect(active.has(id)).toBe(true);
      active.delete(id);
    }),
    reset: vi.fn((id) => {
      expect(active.has(id!)).toBe(true);
    }),
  };
  const onToken = vi.fn();
  const view = render(
    <StrictMode>
      <Turnstile onToken={onToken} resetSignal={3} />
    </StrictMode>,
  );
  expect(active.size).toBe(1);
  expect(window.turnstile.reset).not.toHaveBeenCalled();
  view.rerender(
    <StrictMode>
      <Turnstile onToken={onToken} resetSignal={4} />
    </StrictMode>,
  );
  expect(window.turnstile.reset).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(active.size).toBe(0);
});

it("fits the available form width and invalidates tokens only when the widget layout changes", () => {
  let width = 420;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => width,
  );
  let resize: () => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  let count = 0;
  window.turnstile = {
    render: vi.fn(() => `widget-${++count}`),
    remove: vi.fn(),
    reset: vi.fn(),
  };
  const onToken = vi.fn();
  const view = render(
    <Turnstile action="gbe_ticket_booking" onToken={onToken} responsive />,
  );
  expect(window.turnstile.render).toHaveBeenLastCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({ size: "flexible", action: "gbe_ticket_booking" }),
  );
  const host = screen.getByRole("group", {
    name: "Security verification",
  }).firstElementChild;
  expect(host).toHaveStyle({ width: "100%", minHeight: "65px" });
  width = 340;
  act(resize);
  expect(window.turnstile.render).toHaveBeenCalledTimes(1);
  expect(onToken).not.toHaveBeenCalled();
  width = 260;
  act(resize);
  expect(window.turnstile.remove).toHaveBeenCalledWith("widget-1");
  expect(window.turnstile.render).toHaveBeenLastCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({ size: "compact" }),
  );
  expect(onToken).toHaveBeenLastCalledWith("");
  expect(host).toHaveStyle({ width: "150px", minHeight: "140px" });
  width = 480;
  act(resize);
  expect(window.turnstile.render).toHaveBeenLastCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({ size: "flexible" }),
  );
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});
