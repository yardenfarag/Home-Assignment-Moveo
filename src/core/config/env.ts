/**
 * @module core/config/env
 *
 * Reads and validates environment variables with Zod. Each feature has its own
 * getter, so a missing LLM key never breaks, say, the ingest script.
 * Error messages name the missing variables but NEVER print their values.
 */
import { z } from "zod";
import { BoundaryError } from "../errors/boundaryError";

/** A bag of environment variables (process.env or a plain object in tests). */
export type EnvSource = Record<string, string | undefined>;

/** Environment variables needed to talk to Supabase (server-side only). */
const supabaseEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
});

/** Validated Supabase settings. */
export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;

/** Environment variables for the LLM (OpenRouter). Server-side only. */
const openRouterEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(20),
  /** OpenRouter model slug, e.g. `anthropic/claude-sonnet-5.5` (chosen in G9; re-chosen by the Step 8 bakeoff). */
  OPENROUTER_MODEL: z.string().regex(/^[a-z0-9-]+\/[a-z0-9.:-]+$/, "expected provider/model, e.g. anthropic/claude-sonnet-5.5"),
});

/** Validated OpenRouter settings. */
export type OpenRouterEnv = z.infer<typeof openRouterEnvSchema>;

/** Site access (Basic Auth, Q16/A2) and the nightly job's secret (A3). */
const accessEnvSchema = z.object({
  APP_USERNAME: z.string().min(3),
  APP_PASSWORD: z.string().min(12, "use at least 12 characters"),
  /** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically. */
  CRON_SECRET: z.string().min(16, "use at least 16 random characters"),
});

/** Validated access settings. */
export type AccessEnv = z.infer<typeof accessEnvSchema>;

/**
 * Every env schema, by feature. Add new feature schemas here so the
 * `.env.example` drift test covers them automatically.
 */
export const ENV_SCHEMAS = {
  supabase: supabaseEnvSchema,
  openRouter: openRouterEnvSchema,
  access: accessEnvSchema,
} as const;

/**
 * Validates `source` against `schema` and throws a readable config error listing
 * the bad variable names (values are never included).
 * @param schema - Zod schema for the variables.
 * @param source - where to read variables from (defaults to `process.env`).
 * @param functionName - caller name for the error message.
 * @returns the parsed variables.
 */
function parseEnv<T extends z.ZodType>(schema: T, source: EnvSource, functionName: string): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ");
    throw new BoundaryError({
      name: "EnvValidationError",
      message: `Missing or invalid environment variables: ${names}. See .env.example`,
      functionName,
      boundary: "config",
    });
  }
  return result.data;
}

/**
 * Returns validated Supabase settings.
 * @param source - variables to read (defaults to `process.env`; injectable for tests).
 * @returns the Supabase URL and secret key.
 * @throws BoundaryError when a variable is missing or malformed.
 */
export function getSupabaseEnv(source: EnvSource = process.env): SupabaseEnv {
  return parseEnv(supabaseEnvSchema, source, "getSupabaseEnv");
}

/**
 * Returns validated OpenRouter settings.
 * @param source - variables to read (defaults to `process.env`; injectable for tests).
 * @returns the API key and model slug.
 * @throws BoundaryError when a variable is missing or malformed.
 */
export function getOpenRouterEnv(source: EnvSource = process.env): OpenRouterEnv {
  return parseEnv(openRouterEnvSchema, source, "getOpenRouterEnv");
}

/**
 * Returns validated access settings (site login + cron secret).
 * @param source - variables to read (defaults to `process.env`; injectable for tests).
 * @returns username, password and cron secret.
 * @throws BoundaryError when a variable is missing or too weak.
 */
export function getAccessEnv(source: EnvSource = process.env): AccessEnv {
  return parseEnv(accessEnvSchema, source, "getAccessEnv");
}
