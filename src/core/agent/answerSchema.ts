/**
 * @module core/agent/answerSchema
 *
 * The structured-output contract between the LLM and our code (requirement 7).
 * - `llmAnswerSchema`: what the MODEL must produce (validated by the AI SDK with Zod).
 * - `FinalAnswer`: what our CODE returns after checking and correcting it
 *   (premise verdict, confidence, disclaimer and caveats are set by code).
 */
import { z } from "zod";
import { CONFIDENCE_LEVELS, HAZARDS, RISK_LEVELS, type Confidence, type Hazard, type RiskLevel } from "../scoring/types";

/** A number the answer relies on — it must come from a tool result (G3). */
export const dataUsedSchema = z.object({
  hubId: z.string().nullable().describe("Hub id the number is about, or null if not hub-specific."),
  label: z.string().describe('What the number is, e.g. "overall risk score", "% of days with measurable snow in 2025".'),
  value: z.number().describe("The number EXACTLY as a tool returned it. Never compute or convert numbers yourself."),
  unit: z.string().describe('Unit as the tool gave it, e.g. "score 0-100", "%", "days/yr".'),
});

/** The claim a question makes about a hub's risk level, extracted by the model (G5). */
export const premiseClaimSchema = z.object({
  hubId: z.string(),
  hazard: z.enum(HAZARDS).nullable().describe("The hazard the claim is about, or null for the overall risk."),
  claimedLevel: z.enum(RISK_LEVELS).describe("The level the question assumes, e.g. 'Why is Dallas high?' → high."),
});

/** What the model must return as its final answer. */
export const llmAnswerSchema = z.object({
  answer: z
    .string()
    .describe("The answer for the analyst, in Markdown, at most ~250 words. Plain language. Explain WHY using the tool numbers."),
  outOfScope: z.boolean().describe("True when the question is not about weather risk for our hubs."),
  hubsMentioned: z.array(z.string()).describe("Ids of the hubs the answer talks about (must come from tool results)."),
  dataUsed: z
    .array(dataUsedSchema)
    .max(12)
    .describe("The key numbers the answer relies on (at most 12), copied exactly from tool results."),
  premiseClaim: premiseClaimSchema
    .nullable()
    .describe("If the question ASSUMES a hub's risk level (e.g. 'why is X high?'), extract that claim; otherwise null."),
  confidence: z.enum(CONFIDENCE_LEVELS).nullable().describe("Your best guess; code recomputes it from the data."),
  assumptions: z.array(z.string()).describe("Assumptions behind this answer, e.g. 'last year = calendar 2025'."),
  limitations: z
    .array(z.string())
    .describe("Only limitations SPECIFIC to this answer. Standing data caveats are added automatically by code — do not repeat them."),
  followUpSuggestions: z.array(z.string()).max(3).describe("Up to 3 short follow-up questions the analyst might ask next."),
  recommendation: z
    .object({
      stance: z.enum(["recommend", "lean_yes", "lean_no", "not_recommended", "cannot_say"]),
      summary: z.string(),
      reasons: z.array(z.string()).describe("Each reason must point to a number in dataUsed."),
      whatWouldChangeIt: z.array(z.string()),
    })
    .nullable()
    .describe("Only for decision questions ('should we…?'); otherwise null."),
});

/** The model's raw answer. */
export type LlmAnswer = z.infer<typeof llmAnswerSchema>;

/** The premise verdict, decided by code (G5). */
export interface PremiseCheck {
  hubId: string;
  hazard: Hazard | null;
  claimedLevel: RiskLevel;
  actualLevel: RiskLevel;
  holds: boolean;
}

/** A tool call made while answering (for transparency and charts). */
export interface ToolCallRecord {
  tool: string;
  input: unknown;
  output: unknown;
}

/** The answer our API returns, after code checks and corrections. */
export interface FinalAnswer {
  answer: string;
  outOfScope: boolean;
  hubsMentioned: string[];
  dataUsed: LlmAnswer["dataUsed"];
  premiseCheck: PremiseCheck | null;
  /** Set by code (G6). Null for out-of-scope or data-free answers. */
  confidence: Confidence | null;
  assumptions: string[];
  /** Model's limitations PLUS every standing caveat for what was used (G4). */
  limitations: string[];
  followUpSuggestions: string[];
  recommendation: (NonNullable<LlmAnswer["recommendation"]> & { disclaimer: string }) | null;
  meta: {
    model: string;
    toolCalls: ToolCallRecord[];
    /** Soft problems (e.g. a number in the text not found in tool results). */
    warnings: string[];
    retried: boolean;
    /** True when code replaced the model's confidence. */
    confidenceOverridden: boolean;
  };
}
