import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appDirectory = path.join(process.cwd(), "src/app");

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(entryPath) : [entryPath];
  });
}

function hasLoadingBoundary(pagePath: string) {
  let directory = path.dirname(pagePath);
  while (directory !== appDirectory) {
    if (existsSync(path.join(directory, "loading.tsx"))) return true;
    directory = path.dirname(directory);
  }
  return path.dirname(pagePath) === appDirectory;
}

describe("route loading boundaries", () => {
  it("gives every nested page a route-appropriate loading boundary", () => {
    const uncoveredPages = filesIn(appDirectory)
      .filter((file) => file.endsWith(`${path.sep}page.tsx`))
      .filter((page) => !hasLoadingBoundary(page))
      .map((page) => path.relative(appDirectory, page));

    expect(uncoveredPages).toEqual([]);
  });
});
