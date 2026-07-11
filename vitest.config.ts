import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["tests/integration/**", "tests/e2e/**", "node_modules/**"],
    coverage: { reporter: ["text", "json", "html"] },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
