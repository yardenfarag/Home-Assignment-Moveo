/**
 * Seasonality strip (U3b): the headline number plus WHEN those days happen —
 * hazard days per month across the period. Numbers come from get_weather_stat.
 */
import type { WeatherStatOutput } from "@/core/agent/tools/getWeatherStat";
import { formatDual } from "@/core/utils/units";

/** Props for {@link SeasonalityStrip}. */
interface SeasonalityStripProps {
  data: WeatherStatOutput;
  /** The user's unit system — the threshold text flips instantly (U4). */
}

/** Renders the big number and the monthly strip. */
export function SeasonalityStrip({ data }: SeasonalityStripProps) {
  const max = Math.max(1, ...data.byMonth.map((m) => m.daysMeeting));
  const singleYear = new Set(data.byMonth.map((m) => m.month.slice(0, 4))).size === 1;
  return (
    <figure className="space-y-3">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-medium tabular-nums text-slate-100">
          {data.percentOfDays === null ? "—" : `${data.percentOfDays}%`}
        </span>
        <span className="text-sm text-slate-300">
          {data.daysMeeting} of {data.daysWithData} days with {formatDual(data.thresholdBySystem, "us")}
          <span className="text-slate-500"> · {data.hub} · {data.period.label}</span>
        </span>
      </figcaption>
      {/* Columns stretch to the strip's fixed height so each bar's % height has a definite parent. */}
      <div className="flex h-24 gap-1" role="img" aria-label={`${data.metricLabel}s per month`}>
        {data.byMonth.map((m) => (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${m.label}: ${m.daysMeeting} day(s)`}>
            <span className="text-[10px] leading-none tabular-nums text-slate-400">{m.daysMeeting > 0 ? m.daysMeeting : ""}</span>
            <div className="relative w-full flex-1">
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-sm bg-sky-400/70"
                style={{ height: `${(m.daysMeeting / max) * 100}%`, minHeight: m.daysMeeting > 0 ? 3 : 0 }}
              />
            </div>
            <span className="text-[10px] leading-none text-slate-500">
              {singleYear ? m.label.slice(0, 1) : m.label.slice(0, 3)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">
        {data.metricLabel[0].toUpperCase() + data.metricLabel.slice(1)}s per month
        {data.usedInRiskScore ? "" : " · reported only, not part of the risk score"}
      </p>
    </figure>
  );
}
