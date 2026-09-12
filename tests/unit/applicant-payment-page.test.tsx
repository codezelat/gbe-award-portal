import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  rows: [] as Array<{
    application: { reference: string };
    payment: {
      status: string;
      method: string | null;
      amountMinor: number;
      currency: string;
    };
  }>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: async () => fixture.rows }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/server/dal/auth", () => ({
  requirePortalSession: async () => ({ profile: { id: "local-owner" } }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/components/uploads/authenticated-upload", () => ({
  AuthenticatedUpload: () => <div>Replace proof uploader</div>,
}));
import Page from "@/app/portal/applications/[applicationId]/payment/page";

afterEach(() => cleanup());
const params = Promise.resolve({ applicationId: "local-test" });

it.each(["card", "bank_transfer", null])(
  "shows verified %s payment instead of a broken replacement page",
  async (method) => {
    fixture.rows = [
      {
        application: { reference: "GBE-2026-654321" },
        payment: {
          status: "verified",
          method,
          amountMinor: 6500000,
          currency: "LKR",
        },
      },
    ];
    render(await Page({ params }));
    expect(
      screen.getByRole("heading", { name: "Payment" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Replace proof uploader"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/RCT-/)).not.toBeInTheDocument();
  },
);

it("still provides replacement upload for rejected bank proof", async () => {
  fixture.rows = [
    {
      application: { reference: "GBE-2026-654321" },
      payment: {
        status: "rejected",
        method: "bank_transfer",
        amountMinor: 6500000,
        currency: "LKR",
      },
    },
  ];
  render(await Page({ params }));
  expect(screen.getByText("Replace proof uploader")).toBeInTheDocument();
});

it("does not expose missing or inaccessible nominations", async () => {
  fixture.rows = [];
  await expect(Page({ params })).rejects.toThrow("NOT_FOUND");
});
