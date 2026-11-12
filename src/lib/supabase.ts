import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** Reads an env var, trimming stray spaces, quotes and line breaks pasted into the dashboard. */
export const env = (name: string) => (process.env[name] || "").trim().replace(/^["']|["']$/g, "");

const url = () => {
  const v = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return v;
};

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

let admin: SupabaseClient | null = null;

/**
 * Service role client. Bypasses row level security, so it is used only for
 * work that has no signed-in user (public signing links) or that RLS does not
 * allow by design (inviting members, storage). Every query made with it must
 * filter by firm_id explicitly.
 */
export function adminDb(): SupabaseClient {
  if (!admin) {
    const key = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    admin = createClient(url(), key, opts);
  }
  return admin;
}

let anonClient: SupabaseClient | null = null;
const anonKey = () => {
  const v = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  return v;
};

/** Public-key client, used only to verify a user's access token. */
export function authDb(): SupabaseClient {
  if (!anonClient) anonClient = createClient(url(), anonKey(), opts);
  return anonClient;
}

/** A client that acts as the signed-in user, so row level security applies. */
export function userDb(accessToken: string): SupabaseClient {
  const anon = env("SUPABASE_ANON_KEY") || env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!anon) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  return createClient(url(), anon, {
    ...opts,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export const BUCKET = "documents";
