/**
 * @module app/_lib/labels
 *
 * UI copy and colors for hazards and levels. Colors are colorblind-safe
 * (Okabe–Ito palette for hazards) and are ALWAYS paired with a text label.
 */
import type { Confidence, Hazard, RiskLevel } from "@/core/scoring/types";

/** Display name and color per hazard. */
export const HAZARD_UI: Record<Hazard, { label: string; icon: string; color: string }> = {
  hurricane: { label: "Hurricane", icon: "🌀", color: "#CC79A7" },
  winter: { label: "Winter", icon: "❄️", color: "#56B4E9" },
  flood: { label: "Flood", icon: "🌊", color: "#0072B2" },
  severeStorms: { label: "Severe storms", icon: "⛈️", color: "#E69F00" },
  wind: { label: "Wind", icon: "💨", color: "#009E73" },
  heat: { label: "Heat", icon: "🔥", color: "#D55E00" },
};

/** Display name and colors per risk level. */
export const LEVEL_UI: Record<RiskLevel, { label: string; text: string; bg: string; border: string }> = {
  low: { label: "Low", text: "#93c5fd", bg: "rgba(96,165,250,0.14)", border: "rgba(96,165,250,0.35)" },
  medium: { label: "Medium", text: "#fcd34d", bg: "rgba(251,191,36,0.14)", border: "rgba(251,191,36,0.35)" },
  high: { label: "High", text: "#fda4af", bg: "rgba(251,113,133,0.16)", border: "rgba(251,113,133,0.4)" },
};

/** Display copy per confidence level. */
export const CONFIDENCE_UI: Record<Confidence, { label: string; dot: string }> = {
  high: { label: "High confidence", dot: "#34d399" },
  medium: { label: "Medium confidence", dot: "#fbbf24" },
  low: { label: "Low confidence", dot: "#fb7185" },
};

/** The brief's four example questions (defined in core: the guard's decline card uses them too). */
export { EXAMPLE_QUESTIONS } from "@/core/agent/config";

/**
 * Formats an ISO timestamp as a short relative time ("just now", "3 h ago", "Nov 24").
 * @param iso - ISO timestamp.
 * @param now - current time (injectable).
 * @returns short text, or "—" when the timestamp can't be read.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "—";
  const minutes = Math.round((now.getTime() - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The question asked when someone selects a hub in the overview or an alert.
 * @param hub - the hub's display name.
 * @param level - its current risk level.
 * @returns e.g. "Why is Dallas, TX's weather risk high?".
 */
export function whyLevelQuestion(hub: string, level: RiskLevel): string {
  return `Why is ${hub}'s weather risk ${LEVEL_UI[level].label.toLowerCase()}?`;
}

/**
 * A progress label without its trailing "…" (for finished steps).
 * @param label - e.g. "Ranking hubs…".
 * @returns e.g. "Ranking hubs".
 */
export const withoutEllipsis = (label: string): string => label.replace(/…$/, "");
