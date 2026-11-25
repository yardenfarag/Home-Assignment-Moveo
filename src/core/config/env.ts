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

/** An OpenRouter model slug: `provider/model`, e.g. `anthropic/claude-sonnet-5.5`. */
const modelSlug = z.string().regex(/^[a-z0-9-]+\/[a-z0-9.:-]+$/, "expected provider/model, e.g. anthropic/claude-sonnet-5.5");

/** Environment variables for the LLM (OpenRouter). Server-side only. */
const openRouterEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(20),
  /** The answering model (chosen in G9; re-chosen by the Step 8 bakeoff). */
  OPENROUTER_MODEL: modelSlug,
});

/** Validated OpenRouter settings. */
export type OpenRouterEnv = z.infer<typeof openRouterEnvSchema>;

/** The answer judge (J2): a cheap model from a DIFFERENT provider than the answering model. Same OpenRouter key. */
const judgeEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(20),
  JUDGE_MODEL: modelSlug,
});

/** Validated judge settings. */
export type JudgeEnv = z.infer<typeof judgeEnvSchema>;

/** The out-of-scope guard (D118): Jev on OpenRouter's decisions endpoint, same key. */
const jevEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(20),
  /** Pin the dated snapshot (e.g. typesafe/jev-1.14-20261014) so the tuned cutoffs can't drift (D119). */
  JEV_MODEL: modelSlug,
});

/** Validated guard settings. */
export type JevEnv = z.infer<typeof jevEnvSchema>;

/** The nightly job's secret (A3). The site itself has no login (D113). */
const cronEnvSchema = z.object({
  /** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically. */
  CRON_SECRET: z.string().min(16, "use at least 16 random characters"),
});

/** Validated cron settings. */
export type CronEnv = z.infer<typeof cronEnvSchema>;

/**
 * Every env schema, by feature. Add new feature schemas here so the
 * `.env.example` drift test covers them automatically.
 */
export const ENV_SCHEMAS = {
  supabase: supabaseEnvSchema,
  openRouter: openRouterEnvSchema,
  cron: cronEnvSchema,
  jev: jevEnvSchema,
  judge: judgeEnvSchema,
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
 * Returns validated guard settings.
 * @param source - variables to read (defaults to `process.env`; injectable for tests).
 * @returns the API key and Jev model id.
 * @throws BoundaryError when a variable is missing or malformed.
 */
export function getJevEnv(source: EnvSource = process.env): JevEnv {
  return parseEnv(jevEnvSchema, source, "getJevEnv");
}

/**
 * Returns the validated cron secret.
 * @param source - variables to read (defaults to `process.env`; injectable for tests).
 * @returns the cron secret.
 * @throws BoundaryError when it is missing or too short.
 */
export function getCronEnv(source: EnvSource = process.env): CronEnv {
  return parseEnv(cronEnvSchema, source, "getCronEnv");
}

/**
 * Returns validated judge settings.
 * @param source - variables to read (defaults to `process.env`; injectable for tests).
 * @returns the API key and judge model slug.
 * @throws BoundaryError when a variable is missing or malformed.
 */
export function getJudgeEnv(source: EnvSource = process.env): JudgeEnv {
  return parseEnv(judgeEnvSchema, source, "getJudgeEnv");
}
