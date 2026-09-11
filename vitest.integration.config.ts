import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // Loads .env, .env.local, .env.test, .env.test.local (mode is "test" under `vitest run`)
  // so SUPABASE_URL / SUPABASE_KEY / SUPABASE_SERVICE_ROLE_KEY reach process.env for test setup.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
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
  };
});
