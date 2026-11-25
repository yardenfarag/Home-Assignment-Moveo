/**
 * @module core/utils/units
 *
 * Unit conversions and dual-unit text. All conversions happen here, in code —
 * the LLM never converts numbers itself (G2).
 */

/** The two display systems a user can pick (G2b). */
export const UNIT_SYSTEMS = ["us", "metric"] as const;

/** US customary or metric. */
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

/** The same quantity written in both systems. */
export interface DualText {
  metric: string;
  us: string;
}

/** @returns centimetres → inches. */
export const cmToInches = (cm: number): number => cm / 2.54;

/** @returns millimetres → inches. */
export const mmToInches = (mm: number): number => mm / 25.4;

/** @returns °C → °F. */
export const celsiusToFahrenheit = (c: number): number => (c * 9) / 5 + 32;

/** @returns km/h → mph. */
export const kmhToMph = (kmh: number): number => kmh / 1.609344;

/**
 * Formats a number for display with at most `decimals` digits (trailing zeros dropped).
 * @param value - the number.
 * @param decimals - max digits after the point.
 * @returns e.g. "5.9", "104", "-0.4".
 */
export function formatNumber(value: number, decimals = 1): string {
  return String(Number(value.toFixed(decimals)));
}

/**
 * Writes a dual quantity, leading with the chosen system.
 * @param text - both spellings.
 * @param system - which one leads.
 * @returns e.g. "5.9 in (15 cm)".
 */
export function formatDual(text: DualText, system: UnitSystem): string {
  return system === "us" ? `${text.us} (${text.metric})` : `${text.metric} (${text.us})`;
}
