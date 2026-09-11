import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/api/**/*.test.ts"],
    testTimeout: 15000,
    setupFiles: ["src/__tests__/setup/astro-env-mock.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
