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
