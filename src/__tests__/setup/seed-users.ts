import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

export interface SeededUser {
  id: string;
  client: SupabaseClient<Database>;
  flashcardId: number;
}

export interface SeededUsers {
  userA: SeededUser;
  userB: SeededUser;
  cleanup: () => Promise<void>;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.test.local.example to .env.test.local and fill in ` +
        "values from `npx supabase status -o env` (requires `npx supabase start` first).",
    );
  }
  return value;
}

let userCounter = 0;

async function createSignedInUser(
  admin: SupabaseClient<Database>,
  url: string,
  anonKey: string,
): Promise<{ id: string; client: SupabaseClient<Database> }> {
  userCounter += 1;
  const email = `test-idor-${Date.now()}-${userCounter}@example.com`;
  const password = "test-password-123!";

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  // admin.createUser()'s typings resolve `error` to always-null with a typed Database generic
  // (supabase-js@2.99.1); the runtime error branch (duplicate email, weak password, etc.) is
  // real despite the typing.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (createError || !created.user) {
    throw new Error(`Failed to create test user: ${createError?.message ?? "unknown error"}`);
  }

  const client = createClient<Database>(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Failed to sign in test user: ${signInError.message}`);
  }

  return { id: created.user.id, client };
}

/**
 * Seeds two throwaway auth users, each with one flashcard row, via the service-role
 * admin client (test-only — never used in app code). Returns per-user signed-in
 * clients so tests can run the same query pattern each route uses against the
 * *other* user's row, and a `cleanup()` to tear everything down afterward.
 */
export async function seedTwoUsers(): Promise<SeededUsers> {
  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [a, b] = await Promise.all([createSignedInUser(admin, url, anonKey), createSignedInUser(admin, url, anonKey)]);

  const [rowA, rowB] = await Promise.all([
    admin
      .from("flashcards")
      .insert({ question: "Seed A", answer: "Seed A", source: "manual", user_id: a.id })
      .select()
      .maybeSingle(),
    admin
      .from("flashcards")
      .insert({ question: "Seed B", answer: "Seed B", source: "manual", user_id: b.id })
      .select()
      .maybeSingle(),
  ]);

  if (rowA.error || !rowA.data) {
    throw new Error(`Failed to seed flashcard for user A: ${rowA.error?.message ?? "no row returned"}`);
  }
  if (rowB.error || !rowB.data) {
    throw new Error(`Failed to seed flashcard for user B: ${rowB.error?.message ?? "no row returned"}`);
  }

  const userA: SeededUser = { id: a.id, client: a.client, flashcardId: rowA.data.id };
  const userB: SeededUser = { id: b.id, client: b.client, flashcardId: rowB.data.id };

  const cleanup = async () => {
    await admin.from("flashcards").delete().eq("id", userA.flashcardId);
    await admin.from("flashcards").delete().eq("id", userB.flashcardId);
    await admin.auth.admin.deleteUser(userA.id);
    await admin.auth.admin.deleteUser(userB.id);
  };

  return { userA, userB, cleanup };
}
