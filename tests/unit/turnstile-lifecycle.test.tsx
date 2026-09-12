import React, { StrictMode, useEffect } from "react";
import { render, cleanup } from "@testing-library/react";
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
