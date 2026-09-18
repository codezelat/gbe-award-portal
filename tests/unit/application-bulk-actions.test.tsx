import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationBulkActions } from "@/components/admin/application-bulk-actions";
import { ApplicationsTable } from "@/components/admin/applications-table";
import {
  bulkStatusIssue,
  bulkStatusOptions,
  type BulkSelection,
} from "@/lib/domain/bulk-applications";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/server/actions/application-bulk-update", () => ({
  updateSelectedApplications: mocks.update,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toast } }));
const row: BulkSelection = {
  id: "fca32a01-1424-44bb-bd7f-1e3900f073dc",
  reference: "GBE-2026-123456",
  nomineeName: "Test Trading",
  workflowStatus: "submitted",
  paymentStatus: "verified",
  updatedAt: "2026-09-18T00:00:00.000Z",
  deleted: false,
};
const permissions = {
  status: bulkStatusOptions.map((option) => option.value),
  assign: true,
  message: true,
  export: true,
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("bulk status rules", () => {
  it("shares the canonical transition rules and payment guard", () => {
    expect(bulkStatusIssue(row, "approved")).toBeNull();
    expect(bulkStatusIssue(row, "winner")).toMatch(/not available/);
    expect(
      bulkStatusIssue(
        {
          ...row,
          workflowStatus: "approved",
          paymentStatus: "proof_submitted",
        },
        "entry_confirmed",
      ),
    ).toMatch(/Verify/);
    expect(bulkStatusIssue({ ...row, deleted: true }, "approved")).toMatch(
      /Restore/,
    );
    expect(
      bulkStatusIssue({ ...row, workflowStatus: "winner" }, "archived"),
    ).toBeNull();
    expect(
      bulkStatusIssue({ ...row, workflowStatus: "approved" }, "approved"),
    ).toBeNull();
  });
});
function setup(rows = [row]) {
  const clear = vi.fn();
  render(
    <ApplicationBulkActions
      selected={rows}
      reviewers={[]}
      permissions={permissions}
      exportUrl="/export"
      onClear={clear}
    />,
  );
  return clear;
}
describe("bulk action dialogs", () => {
  it("selects a row without navigating, including clicks in the selection cell", () => {
    const { container } = render(
      <ApplicationsTable
        rows={[
          {
            ...row,
            designation: null,
            categoryNameSnapshot: "Business",
            awardNomination: "Test nomination",
            emailDisplay: "test@example.test",
            phoneDisplay: "+94 77 123 4567",
            submittedLabel: "18 Sep 2026",
            reviewerName: "Staff",
            updatedLabel: "18 Sep 2026",
          },
        ]}
        reviewers={[]}
        permissions={permissions}
        exportBase="/export?"
      />,
    );
    const checkbox = container.querySelector('tbody [role="checkbox"]')!;
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(checkbox.closest("td")!);
    expect(mocks.push).not.toHaveBeenCalled();
    const table = container.querySelector("table")!;
    expect(table).toHaveClass("min-w-[1200px]");
    expect(table.parentElement).toHaveClass("overflow-x-auto");
    const email = table.querySelector('a[href^="mailto:"]')!;
    const phone = table.querySelector('a[href^="tel:"]')!;
    expect(email).toHaveTextContent("@example.test");
    expect(phone).toHaveAttribute("href", "tel:+94771234567");
    phone.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(phone);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(container.querySelector('article a[href^="mailto:"]')).toBeTruthy();
    expect(container.querySelector('article a[href^="tel:"]')).toBeTruthy();
    fireEvent.click(container.querySelector("tbody tr")!);
    expect(mocks.push).toHaveBeenCalledWith(`/admin/applications/${row.id}`);
  });
  it("shows status updates directly and blocks an incompatible mixed selection", async () => {
    setup([
      row,
      {
        ...row,
        id: crypto.randomUUID(),
        reference: "GBE-2026-654321",
        workflowStatus: "archived",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));
    fireEvent.change(await screen.findByLabelText("New status"), {
      target: { value: "approved" },
    });
    expect(
      screen.getByRole("button", { name: "Confirm update" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("GBE-2026-654321");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("requires an internal reason for rejection", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));
    fireEvent.change(await screen.findByLabelText("New status"), {
      target: { value: "rejected" },
    });
    expect(screen.getByLabelText("Internal reason")).toBeRequired();
    expect(screen.getByLabelText("Internal reason")).toHaveAttribute(
      "minlength",
      "8",
    );
  });
  it("keeps the request ID on retry and disables duplicate submissions", async () => {
    const clear = setup();
    let resolve!: (value: { ok: false; message: string }) => void;
    mocks.update.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));
    fireEvent.change(await screen.findByLabelText("New status"), {
      target: { value: "under_review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm update" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("button", { name: /Saving/ }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    const first = mocks.update.mock.calls[0][0];
    await act(async () => resolve({ ok: false, message: "Please retry" }));
    mocks.update.mockResolvedValueOnce({
      ok: true,
      message: "1 nomination updated.",
      warnings: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm update" }));
    await waitFor(() => expect(clear).toHaveBeenCalledOnce());
    expect(mocks.update.mock.calls[1][0].requestId).toBe(first.requestId);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("keeps approval access warnings visible rather than claiming the whole batch failed", async () => {
    setup();
    mocks.update.mockResolvedValue({
      ok: true,
      message: "1 nomination updated.",
      warnings: [{ id: row.id, reference: row.reference }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Update status" }));
    fireEvent.change(await screen.findByLabelText("New status"), {
      target: { value: "approved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm update" }));
    expect(
      await screen.findByRole("link", { name: row.reference! }),
    ).toHaveAttribute("href", `/admin/applications/${row.id}`);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("hides actions without the corresponding permission", () => {
    render(
      <ApplicationBulkActions
        selected={[row]}
        reviewers={[]}
        permissions={{
          status: [],
          assign: false,
          message: false,
          export: false,
        }}
        exportUrl="/export"
        onClear={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Update status" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Assign" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Export" }),
    ).not.toBeInTheDocument();
  });
});
