"use client";
/**
 * "Recent changes" (Step 13, bonus, D124): score-change alerts from the nightly re-score.
 * Shown only while there are alerts this browser hasn't dismissed. Each one can be
 * dismissed (✕) or opened as a question to the agent. A test alert is clearly tagged.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { RecentAlert } from "@/core/alerts/recentAlerts";
import { LEVEL_UI, relativeTime } from "../_lib/labels";
import { EMPTY_IDS, dismissAlert, dismissedAlertsSnapshot, subscribeToStorage } from "../_lib/storage";

/** Props for {@link RecentChanges}. */
interface RecentChangesProps {
  onAsk: (question: string) => void;
}

/** One alert in plain words, e.g. "rose 8.2 points to 72.4 (now High)". */
function describe(alert: RecentAlert): string {
  const direction = alert.change >= 0 ? "rose" : "fell";
  const levelChanged = alert.fromLevel !== alert.toLevel;
  return `${direction} ${Math.abs(alert.change)} points to ${alert.toScore}${levelChanged ? ` (${LEVEL_UI[alert.fromLevel].label} → ${LEVEL_UI[alert.toLevel].label})` : ""}`;
}

/** Renders the card, or nothing when there's nothing new. */
export function RecentChanges({ onAsk }: RecentChangesProps) {
  const [alerts, setAlerts] = useState<RecentAlert[]>([]);
  const dismissed = useSyncExternalStore(subscribeToStorage, dismissedAlertsSnapshot, () => EMPTY_IDS);

  useEffect(() => {
    let alive = true;
    fetch("/api/alerts")
      .then((res) => (res.ok ? (res.json() as Promise<{ alerts: RecentAlert[] }>) : Promise.reject(new Error(String(res.status)))))
      .then((json) => alive && setAlerts(json.alerts))
      .catch(() => {
        // Quiet on failure: alerts are extra information, the rest of the overview still works.
      });
    return () => {
      alive = false;
    };
  }, []);

  const visible = alerts.filter((alert) => !dismissed.includes(alert.id));
  if (visible.length === 0) return null;

  return (
    <section className="glass w-[85%] shrink-0 snap-start rounded-2xl border border-amber-400/30 p-4 lg:w-auto" aria-label="Recent changes">
      <h2 className="flex items-center gap-2 text-sm font-medium text-amber-200">
        <span aria-hidden="true">🔔</span> Recent changes
      </h2>
      <p className="mb-3 mt-1 text-xs leading-relaxed text-slate-400">
        After each nightly update, hubs whose risk level changed or whose score moved 10+ points.
      </p>
      <ul className="space-y-2">
        {visible.map((alert) => (
          <li key={alert.id} className="flex items-start gap-2 rounded-lg bg-white/[0.03] p-2">
            <button
              type="button"
              className="flex-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              onClick={() => onAsk(`Why is ${alert.hubName}'s weather risk ${LEVEL_UI[alert.toLevel].label.toLowerCase()}?`)}
            >
              <span className="text-slate-100">{alert.hubName}</span>{" "}
              {alert.test && <span className="ml-1 rounded bg-slate-600/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-200">test</span>}
              <span className="block text-xs text-slate-400">
                {describe(alert)} · {relativeTime(alert.createdAt)}
                {alert.test ? " · not a real change" : ""}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Dismiss the ${alert.hubName} alert`}
              className="rounded px-1.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              onClick={() => dismissAlert(alert.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
