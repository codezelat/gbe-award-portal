import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const navigation = vi.hoisted(() => ({
  search: new URLSearchParams("page=2"),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/in-progress",
  useSearchParams: () => navigation.search,
  useRouter: () => ({ replace: navigation.replace }),
}));
import { DebouncedApplicationSearch } from "@/components/admin/debounced-application-search";
import { Table } from "@/components/ui/table";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  navigation.search = new URLSearchParams("page=2");
  navigation.replace.mockClear();
});

describe("admin list UX", () => {
  it("resets pagination when searching and preserves the scroll position", () => {
    vi.useFakeTimers();
    render(<DebouncedApplicationSearch />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Trading" } });
    act(() => vi.advanceTimersByTime(350));
    expect(navigation.replace).toHaveBeenCalledWith(
      "/admin/in-progress?search=Trading", { scroll: false },
    );
  });

  it("reflects Clear/back navigation without restoring a stale search", () => {
    vi.useFakeTimers();
    navigation.search = new URLSearchParams("search=Trading");
    const { rerender } = render(<DebouncedApplicationSearch defaultValue="Trading" />);
    navigation.search = new URLSearchParams();
    rerender(<DebouncedApplicationSearch />);
    expect(screen.getByRole("textbox")).toHaveValue("");
    act(() => vi.advanceTimersByTime(500));
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("does not block vertical touch scrolling inside tables", () => {
    const { container } = render(<Table><tbody><tr><td>Nominee</td></tr></tbody></Table>);
    expect(container.firstChild).not.toHaveClass("touch-pan-x");
  });

  it("uses mobile cards for drafts without hiding nomination details", () => {
    const source = readFileSync("src/components/admin/in-progress-table.tsx", "utf8");
    expect(source).toContain('className="divide-y xl:hidden"');
    expect(source).toContain('className="hidden xl:block"');
    expect(source).toContain("row.nomination");
    expect(source).toContain("[overflow-wrap:anywhere]");
  });
});
