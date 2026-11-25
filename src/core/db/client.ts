/**
 * @module core/db/client
 *
 * The one place that creates a Supabase client. Server-side only: it uses the
 * secret key, which bypasses RLS, so it must never be imported by browser code.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "../config/env";
import { DATABASE_TIMEOUT_MS } from "../config/timeouts";
import { withTimeout } from "../data/http";
import type { Database } from "./database.types";

/** A Supabase client typed against our schema. */
export type Db = SupabaseClient<Database>;

let cachedClient: Db | undefined;

/**
 * Returns a shared, typed Supabase client (created on first use). Every request
 * has a {@link DATABASE_TIMEOUT_MS} deadline, because supabase-js has none by default.
 * @returns the database client.
 * @throws BoundaryError (config) when Supabase env variables are missing.
 */
export function getDb(): Db {
  if (!cachedClient) {
    const env = getSupabaseEnv();
    cachedClient = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: withTimeout(fetch, DATABASE_TIMEOUT_MS) },
    });
  }
  return cachedClient;
}
