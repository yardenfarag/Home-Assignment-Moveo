/**
 * @module core/scoring/hazards
 *
 * Scores each of the six hazards 0–100 from observed weather and FEMA (D18, D49, D53):
 *
 * | Hazard        | Observed half                     | FEMA half                                   |
 * |---------------|-----------------------------------|---------------------------------------------|
 * | hurricane     | —                                 | hurricane                                   |
 * | winter        | max(snow days, extreme cold days) | max(winter weather, cold wave, ice storm)   |
 * | flood         | heavy rain days                   | max(inland flood per area*, coastal flood) |
 * | severeStorms  | —                                 | avg(tornado per 1,000 sq mi, hail)          |
 * | wind          | gust ≥72 km/h days                | strong wind                                 |
 * | heat          | extreme heat days                 | heat wave                                   |
 *
 * Hazard score = average of the halves that exist.
 * \* per 1,000 sq mi of county, with the area floored at the median US county (D123).
 */
import { FEMA_ANCHORS_P95 as FEMA, INLAND_FLOOD_AREA_FLOOR_SQ_MI, OBSERVED_ANCHORS as OBS } from "./config";
import { femaOnlyConfidence, hybridConfidence, type ConfidenceResult } from "./confidence";
import { linearScore } from "./normalize";
import type { ObservedSignals } from "./observedSignals";
import type { FemaSignals, Hazard, HazardScore, SignalInput } from "./types";

/**
 * Builds one scored input. Missing observed values stay null; FEMA "not applicable" (null) scores 0 (D18).
 * @returns the input with its score.
 */
function input(
  signal: string,
  source: SignalInput["source"],
  value: number | null,
  unit: string,
  anchor100: number,
  nullMeansZero: boolean,
): SignalInput {
  const effective = value === null && nullMeansZero ? 0 : value;
  return { signal, source, value, unit, anchor100, score: effective === null ? null : linearScore(effective, anchor100) };
}

/** Max / average of the non-null scores of some inputs (null if none). */
function combine(inputs: SignalInput[], how: "max" | "avg"): number | null {
  const scores = inputs.map((i) => i.score).filter((s): s is number => s !== null);
  if (scores.length === 0) return null;
  return how === "max" ? Math.max(...scores) : scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** Rounds to 1 decimal (published precision). */
const round1 = (value: number) => Math.round(value * 10) / 10;

/** How a hazard is built: its two halves and how the sources are cross-checked (D49, D56). */
interface HazardRecipe {
  hazard: Hazard;
  /** Observed-weather inputs (empty for FEMA-only hazards) and how to combine them. */
  observed: { inputs: SignalInput[]; how: "max" | "avg" };
  /** FEMA inputs and how to combine them. */
  fema: { inputs: SignalInput[]; how: "max" | "avg" };
  /**
   * Which FEMA signals the "sources disagree" check compares against observed weather:
   * "all" = every FEMA input, a list = only those (like with like), "none" = halves measure different things.
   */
  crossCheck: "all" | "none" | string[];
  /** Share of days with observed data (0..1). */
  coverage: number;
  hasFemaRecord: boolean;
}

/**
 * Assembles a hazard score from its recipe.
 * @param recipe - inputs, combination rules and cross-check settings.
 * @returns the rounded hazard score with confidence and inputs.
 */
function assemble(recipe: HazardRecipe): HazardScore {
  const { hazard, observed, fema, crossCheck, coverage, hasFemaRecord } = recipe;
  const observedScore = observed.inputs.length > 0 ? combine(observed.inputs, observed.how) : null;
  const femaScore = hasFemaRecord ? combine(fema.inputs, fema.how) : null;
  const halves = [observedScore, femaScore].filter((s): s is number => s !== null);
  const score = halves.length === 0 ? 0 : halves.reduce((a, b) => a + b, 0) / halves.length;

  let comparableFemaScore: number | null | "not-comparable" = femaScore;
  if (crossCheck === "none") comparableFemaScore = "not-comparable";
  else if (Array.isArray(crossCheck) && hasFemaRecord) {
    comparableFemaScore = combine(fema.inputs.filter((i) => crossCheck.includes(i.signal)), fema.how);
  }

  const confidence: ConfidenceResult =
    observed.inputs.length === 0
      ? femaOnlyConfidence(femaScore)
      : hybridConfidence({ observedScore, femaScore, comparableFemaScore, coverage });

  return {
    hazard,
    score: round1(score),
    observedScore: observedScore === null ? null : round1(observedScore),
    femaScore: femaScore === null ? null : round1(femaScore),
    confidence: confidence.confidence,
    confidenceReason: confidence.reason,
    inputs: [...observed.inputs, ...(hasFemaRecord ? fema.inputs : [])],
  };
}

/**
 * Scores all six hazards for one hub.
 * @param observed - observed-weather signals, or null when no weather data exists.
 * @param fema - FEMA county signals, or null when no FEMA record exists.
 * @returns a score per hazard.
 */
export function computeHazardScores(observed: ObservedSignals | null, fema: FemaSignals | null): Record<Hazard, HazardScore> {
  const o = observed?.perYear;
  const cov = observed?.coverage;
  const hasFema = fema !== null;
  const f = fema ?? ({} as Partial<FemaSignals>);
  const days = "days/yr";
  const events = "events/yr";
  const obs = (signal: keyof typeof OBS, value: number | null | undefined) =>
    input(signal, "observed", value ?? null, days, OBS[signal], false);
  const fem = (signal: keyof typeof FEMA, value: number | null | undefined, unit = events) =>
    input(signal, "fema", value ?? null, unit, FEMA[signal], true);

  // Inland flood per 1,000 sq mi, with the area floored at the median US county (D123).
  const inlandFloodDensity =
    f.inlandFlood === undefined || f.inlandFlood === null || !f.countyAreaSqMi
      ? null
      : (f.inlandFlood / Math.max(f.countyAreaSqMi, INLAND_FLOOD_AREA_FLOOR_SQ_MI)) * 1_000;
  const tornadoDensity =
    f.tornado === undefined || f.tornado === null || !f.countyAreaSqMi ? null : (f.tornado / f.countyAreaSqMi) * 1_000;

  const none: SignalInput[] = [];
  return {
    hurricane: assemble({
      hazard: "hurricane",
      observed: { inputs: none, how: "max" },
      fema: { inputs: [fem("hurricane", f.hurricane)], how: "max" },
      crossCheck: "all",
      coverage: 1,
      hasFemaRecord: hasFema,
    }),
    winter: assemble({
      hazard: "winter",
      observed: { inputs: [obs("snowDays", o?.snowDays), obs("extremeColdDays", o?.extremeColdDays)], how: "max" },
      fema: {
        inputs: [
          fem("winterWeather", f.winterWeather),
          fem("coldWave", f.coldWave, "event-days/yr"),
          fem("iceStorm", f.iceStorm, "event-days/yr"),
        ],
        how: "max",
      },
      // Ice storms count in the score, but observed weather can't see ice, so they're left out of the cross-check (D56).
      crossCheck: ["winterWeather", "coldWave"],
      coverage: Math.min(cov?.snowfall ?? 0, cov?.tempMin ?? 0),
      hasFemaRecord: hasFema,
    }),
    flood: assemble({
      hazard: "flood",
      observed: { inputs: [obs("heavyRainDays", o?.heavyRainDays)], how: "max" },
      fema: {
        inputs: [fem("inlandFloodPer1000SqMi", inlandFloodDensity, "event-days/yr per 1,000 sq mi"), fem("coastalFlood", f.coastalFlood)],
        how: "max",
      },
      // Heavy-rain days and county-wide flood warnings measure different things (D56).
      crossCheck: "none",
      coverage: cov?.precipitation ?? 0,
      hasFemaRecord: hasFema,
    }),
    severeStorms: assemble({
      hazard: "severeStorms",
      observed: { inputs: none, how: "max" },
      fema: {
        inputs: [fem("tornadoPer1000SqMi", tornadoDensity, "events/yr per 1,000 sq mi"), fem("hail", f.hail)],
        how: "avg",
      },
      crossCheck: "all",
      coverage: 1,
      hasFemaRecord: hasFema,
    }),
    wind: assemble({
      hazard: "wind",
      observed: { inputs: [obs("gustAdvisoryDays", o?.gustAdvisoryDays)], how: "max" },
      fema: { inputs: [fem("strongWind", f.strongWind)], how: "max" },
      crossCheck: "all",
      coverage: cov?.windGust ?? 0,
      hasFemaRecord: hasFema,
    }),
    heat: assemble({
      hazard: "heat",
      observed: { inputs: [obs("extremeHeatDays", o?.extremeHeatDays)], how: "max" },
      fema: { inputs: [fem("heatWave", f.heatWave, "event-days/yr")], how: "max" },
      crossCheck: "all",
      coverage: cov?.apparentTempMax ?? 0,
      hasFemaRecord: hasFema,
    }),
  };
}
