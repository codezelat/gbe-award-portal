import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NominationPayment } from "@/components/forms/nomination-payment";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(["card", "bank_transfer"])(
  "does not display internal receipt numbers for %s payments",
  async (method) => {
    const state = {
      status: "verified",
      method,
      receipt: "RCT-2026-123456",
      amountMinor: 6500000,
      cardAmountMinor: 6500000,
    };
    const fetch = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ ok: true, data: state }) });
    vi.stubGlobal("fetch", fetch);
    render(
      <NominationPayment
        applicationId="local-test"
        reference="GBE-2026-654321"
        bankAmountMinor={6500000}
        currency="LKR"
        initial={state}
        cardEnabled
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("heading", { name: "Payment confirmed" }),
    ).toBeInTheDocument();
    expect(screen.getByText("GBE-2026-654321")).toBeInTheDocument();
    expect(screen.queryByText(/RCT-/)).not.toBeInTheDocument();
  },
);
