"use client";
/**
 * Widget column (A5/U1): top risk hubs, the leader per hazard, data status.
 * Deterministic data from /api/widgets. Clicking an item asks the agent about it.
 */
import { useEffect, useState } from "react";
import type { WidgetsData } from "@/core/widgets/widgetsData";
import { HAZARD_UI, LEVEL_UI, relativeTime } from "../_lib/labels";
import { LevelChip } from "./LevelChip";

/** Props for {@link WidgetsRail}. */
interface WidgetsRailProps {
  onAsk: (question: string) => void;
  /** Reports the data status so the header can show freshness. */
  onStatus: (status: WidgetsData["dataStatus"]) => void;
}

/**
 * Layout (U1): phone = a horizontal swipe strip, tablet = a row of three, desktop = the right-hand column.
 */
const RAIL = "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0 xl:block xl:space-y-4";

/** A glass panel with a title. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass w-[85%] shrink-0 snap-start rounded-2xl p-4 lg:w-auto" aria-label={title}>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

/** Renders the widget column. */
export function WidgetsRail({ onAsk, onStatus }: WidgetsRailProps) {
  const [data, setData] = useState<WidgetsData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/widgets")
      .then((res) => (res.ok ? (res.json() as Promise<WidgetsData>) : Promise.reject(new Error(String(res.status)))))
      .then((json) => {
        if (!alive) return;
        setData(json);
        onStatus(json.dataStatus);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [onStatus]);

  if (failed) {
    return (
      <Panel title="Overview">
        <p className="text-sm text-slate-400">The overview couldn&apos;t load right now. You can still ask anything in the chat.</p>
      </Panel>
    );
  }
  if (!data) {
    return (
      <div className={RAIL} aria-busy="true" aria-label="Loading overview">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass h-40 w-[85%] shrink-0 animate-pulse rounded-2xl motion-reduce:animate-none lg:w-auto" />
        ))}
      </div>
    );
  }

  const button =
    "w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60";
  return (
    <div className={RAIL}>
      <Panel title="Highest overall risk">
        <ol className="space-y-1">
          {data.topHubs.map((hub) => (
            <li key={hub.hubId}>
              <button type="button" className={button} onClick={() => onAsk(`Why is ${hub.hub}'s weather risk ${LEVEL_UI[hub.level].label.toLowerCase()}?`)}>
                <span className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-right tabular-nums text-slate-500">{hub.rank}</span>
                  <span className="flex-1 truncate text-slate-200">{hub.hub}</span>
                  <LevelChip level={hub.level} score={hub.score} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Most exposed, by hazard">
        <ul className="space-y-1">
          {data.hazardLeaders.map((leader) => (
            <li key={leader.hazard}>
              <button type="button" className={button} onClick={() => onAsk(`Which hubs are most exposed to ${HAZARD_UI[leader.hazard].label.toLowerCase()} risk?`)}>
                <span className="flex items-center gap-2 text-sm">
                  <span aria-hidden="true">{HAZARD_UI[leader.hazard].icon}</span>
                  <span className="w-24 text-slate-400">{HAZARD_UI[leader.hazard].label}</span>
                  <span className="flex-1 truncate text-slate-200">{leader.hub}</span>
                  <span className="tabular-nums text-slate-300">{leader.score}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Data status">
        <dl className="space-y-1.5 text-xs text-slate-400">
          <div className="flex justify-between gap-2">
            <dt>Weather data</dt>
            <dd className="text-right text-slate-300">
              {data.dataStatus.weatherFrom} → {data.dataStatus.weatherThrough}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Hubs scored</dt>
            <dd className="text-slate-300">{data.dataStatus.hubCount}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Last scored</dt>
            <dd className="text-slate-300">{relativeTime(data.dataStatus.scoredAt)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Hazard data</dt>
            <dd className="text-right text-slate-300">{data.dataStatus.femaVersion}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}
