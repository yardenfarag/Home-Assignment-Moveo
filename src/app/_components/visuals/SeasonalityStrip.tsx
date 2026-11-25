/**
 * Seasonality strip (U3b): the headline number plus WHEN those days happen —
 * hazard days per month across the period. Numbers come from get_weather_stat.
 * A month without weather data is drawn as "no data" (hatched), never as zero days,
 * and a month with some days missing is marked too (S6, honesty over precision).
 */
import type { WeatherStatOutput } from "@/core/agent/tools/getWeatherStat";
import { describeStrip, stripMonths, type StripMonth } from "../../_lib/seasonality";

/** Props for {@link SeasonalityStrip}. */
interface SeasonalityStripProps {
  /** The get_weather_stat result (threshold already formatted in US units, D126). */
  data: WeatherStatOutput;
}

/** Hatching for months without data (same look in the strip and its legend). */
const NO_DATA_FILL = "repeating-linear-gradient(135deg, rgba(148,163,184,0.35), rgba(148,163,184,0.35) 2px, transparent 2px, transparent 5px)";

/**
 * A column's tooltip.
 * @param m - the month.
 * @returns e.g. "Jul 2025: 3 day(s) (data for 20 of 31 days)".
 */
function monthTitle(m: StripMonth): string {
  if (m.coverage === "none") return `${m.label}: no weather data`;
  const days = `${m.label}: ${m.daysMeeting} day(s)`;
  return m.coverage === "partial" ? `${days} (data for ${m.daysWithData} of ${m.daysInPeriod} days)` : days;
}

/** Renders the big number and the monthly strip. */
export function SeasonalityStrip({ data }: SeasonalityStripProps) {
  const months = stripMonths(data.byMonth, data.period);
  const max = Math.max(1, ...months.map((m) => m.daysMeeting));
  const what = `${data.metricLabel}s`;
  const hasGaps = months.some((m) => m.coverage !== "full");
  const hasYears = months.some((m) => m.yearLabel);
  return (
    <figure className="space-y-3">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-medium tabular-nums text-slate-100">
          {data.percentOfDays === null ? "—" : `${data.percentOfDays}%`}
        </span>
        <span className="text-sm text-slate-300">
          {data.daysMeeting} of {data.daysWithData} days with {data.threshold}
          <span className="text-slate-500"> · {data.hub} · {data.period.label}</span>
        </span>
      </figcaption>
      {/* Columns stretch to the strip's fixed height so each bar's % height has a definite parent. */}
      <div className={`flex gap-1 ${hasYears ? "h-28" : "h-24"}`} role="img" aria-label={describeStrip(months, what)}>
        {months.map((m) => (
          <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={monthTitle(m)}>
            <span className="text-[10px] leading-none tabular-nums text-slate-400">{m.coverage === "none" ? "–" : m.daysMeeting > 0 ? m.daysMeeting : ""}</span>
            <div className="relative w-full flex-1">
              {m.coverage === "none" ? (
                <div className="absolute inset-0 rounded-t-sm" style={{ background: NO_DATA_FILL }} />
              ) : (
                <div
                  className={`absolute inset-x-0 bottom-0 rounded-t-sm ${m.coverage === "partial" ? "bg-sky-400/35 outline-1 outline-dashed outline-sky-300/60" : "bg-sky-400/70"}`}
                  style={{ height: `${(m.daysMeeting / max) * 100}%`, minHeight: m.daysMeeting > 0 ? 3 : 0 }}
                />
              )}
            </div>
            <span className="whitespace-nowrap text-[10px] leading-none text-slate-500">{m.monthLabel || " "}</span>
            {hasYears && <span className="whitespace-nowrap text-[10px] leading-none text-slate-600">{m.yearLabel || " "}</span>}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">
        {what[0].toUpperCase() + what.slice(1)} per month
        {data.usedInRiskScore ? "" : " · reported only, not part of the risk score"}
        {hasGaps && (
          <>
            {" · "}
            <span className="mr-1 inline-block h-2 w-2.5 rounded-sm align-middle" style={{ background: NO_DATA_FILL }} aria-hidden="true" />
            hatched: no weather data that month · faded: some days missing
          </>
        )}
      </p>
    </figure>
  );
}
