import { vi } from "vitest";

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
}));
