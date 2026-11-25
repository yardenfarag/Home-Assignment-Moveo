/**
 * @module core/agent/finalizeAnswer
 *
 * Checks the model's structured answer against what the tools actually returned,
 * and lets CODE decide the things the model must not decide:
 * - hard checks (fail → retry once): hubs and `dataUsed` numbers must trace to tool results (G3);
 *   recommendations need data (D8); a premise must be about a real hub (G5);
 * - soft check (warning only): numbers in the free text not found in tool results (G3);
 * - code-set fields: confidence (G6), premise verdict (G5), standing caveats (G4), disclaimer (D8).
 */
import { weakestConfidence } from "../scoring/confidence";
import type { Hazard, RiskLevel } from "../scoring/types";
import type { FinalAnswer, LlmAnswer, PremiseCheck } from "./answerSchema";
import { RECOMMENDATION_DISCLAIMER } from "./config";
import { collectNumbers, matchesKnownNumber, type ToolLedger } from "./ledger";

/** A hub's real levels, overall and per hazard (from the latest snapshots). */
export interface HubLevels {
  overall: RiskLevel;
  hazards: Partial<Record<Hazard, RiskLevel>>;
}

/** What finalizing needs besides the model's answer. */
export interface FinalizeContext {
  ledger: ToolLedger;
  levelsByHub: Map<string, HubLevels>;
  model: string;
  retried: boolean;
}

/** Either a checked answer, or the problems to send back to the model. */
export type FinalizeResult = { ok: true; answer: FinalAnswer } | { ok: false; problems: string[] };

/**
 * Validates and completes the model's answer.
 * @param raw - the model's structured answer (already schema-valid).
 * @param context - ledger, real levels, model name, retry flag.
 * @returns the final answer, or the list of problems.
 */
export function finalizeAnswer(raw: LlmAnswer, context: FinalizeContext): FinalizeResult {
  const { ledger } = context;
  const problems: string[] = [];
  const knownHubs = ledger.hubIds();
  const knownNumbers = ledger.numbers();

  for (const hubId of raw.hubsMentioned) {
    if (!knownHubs.has(hubId)) problems.push(`hubsMentioned contains "${hubId}", but no tool returned data for it. Call a tool for it or remove it.`);
  }
  for (const item of raw.dataUsed) {
    if (!matchesKnownNumber(item.value, knownNumbers)) {
      problems.push(`dataUsed value ${item.value} ("${item.label}") was not found in any tool result. Use numbers exactly as tools returned them.`);
    }
  }
  if (raw.recommendation && (raw.dataUsed.length === 0 || raw.outOfScope)) {
    problems.push("A recommendation must be backed by tool data listed in dataUsed.");
  }

  let premiseCheck: PremiseCheck | null = null;
  if (raw.premiseClaim) {
    const levels = context.levelsByHub.get(raw.premiseClaim.hubId);
    const actual = levels && (raw.premiseClaim.hazard ? levels.hazards[raw.premiseClaim.hazard] : levels.overall);
    if (!actual) problems.push(`premiseClaim is about "${raw.premiseClaim.hubId}", which is not one of our scored hubs.`);
    else premiseCheck = { ...raw.premiseClaim, actualLevel: actual, holds: actual === raw.premiseClaim.claimedLevel };
  }

  if (problems.length > 0) return { ok: false, problems };

  const confidences = ledger.confidences();
  const confidence = raw.outOfScope || confidences.length === 0 ? null : weakestConfidence(confidences);
  const textNumbers = collectNumbers(raw.answer).filter((n) => !matchesKnownNumber(n, knownNumbers));
  const warnings = textNumbers.map((n) => `The answer text mentions ${n}, which no tool returned.`);
  const limitations = raw.outOfScope ? raw.limitations : [...new Set([...raw.limitations, ...ledger.caveats()])];

  return {
    ok: true,
    answer: {
      answer: raw.answer,
      outOfScope: raw.outOfScope,
      hubsMentioned: raw.hubsMentioned,
      dataUsed: raw.dataUsed,
      premiseCheck,
      confidence,
      assumptions: raw.assumptions,
      limitations,
      followUpSuggestions: raw.followUpSuggestions,
      recommendation: raw.recommendation ? { ...raw.recommendation, disclaimer: RECOMMENDATION_DISCLAIMER } : null,
      meta: {
        model: context.model,
        toolCalls: ledger.calls,
        warnings,
        retried: context.retried,
        confidenceOverridden: raw.confidence !== confidence,
      },
    },
  };
}
