"use client";
/**
 * "Recent changes" (Step 13, bonus, D124): score-change alerts from the nightly re-score.
 * Shown only while there are alerts this browser hasn't dismissed. Each one can be
 * dismissed (✕) or opened as a question to the agent. A test alert is clearly tagged.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { RecentAlert } from "@/core/alerts/recentAlerts";
import { BUSY_HINT } from "../_lib/copy";
import { fetchJson } from "../_lib/fetchJson";
import { LEVEL_UI, relativeTime, whyLevelQuestion } from "../_lib/labels";
import { EMPTY_IDS, dismissAlert, dismissedAlertsSnapshot, subscribeToStorage } from "../_lib/storage";
import { FOCUS_RING, WAITING } from "../_lib/styles";

/** Props for {@link RecentChanges}. */
interface RecentChangesProps {
  onAsk: (question: string) => void;
  /** True while an answer is on its way (asking waits, and says so). */
  busy: boolean;
}

/** One alert in plain words, e.g. "rose 8.2 points to 72.4 (now High)". */
function describe(alert: RecentAlert): string {
  const direction = alert.change >= 0 ? "rose" : "fell";
  const levelChanged = alert.fromLevel !== alert.toLevel;
  return `${direction} ${Math.abs(alert.change)} points to ${alert.toScore}${levelChanged ? ` (${LEVEL_UI[alert.fromLevel].label} → ${LEVEL_UI[alert.toLevel].label})` : ""}`;
}

/** Renders the card, or nothing when there's nothing new. */
export function RecentChanges({ onAsk, busy }: RecentChangesProps) {
  const [alerts, setAlerts] = useState<RecentAlert[]>([]);
  const dismissed = useSyncExternalStore(subscribeToStorage, dismissedAlertsSnapshot, () => EMPTY_IDS);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<{ alerts: RecentAlert[] }>("/api/alerts", { signal: controller.signal })
      .then((json) => setAlerts(Array.isArray(json.alerts) ? json.alerts : []))
      .catch(() => {
        // Quiet on failure: alerts are extra information, the rest of the overview still works.
      });
    return () => controller.abort();
  }, []);

  const visible = alerts.filter((alert) => !dismissed.includes(alert.id));
  if (visible.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] px-3 py-2.5" aria-label="Recent changes">
      <h3 className="flex items-center gap-2 text-sm font-medium text-amber-200">
        <span aria-hidden="true">🔔</span> Recent changes
      </h3>
      <p className="mb-1.5 mt-0.5 text-[11px] leading-snug text-slate-400">Overnight: a risk level changed or a score moved 10+ points.</p>
      <ul className="space-y-1.5">
        {visible.map((alert) => (
          <li key={alert.id} className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5">
            <button
              type="button"
              className={`flex-1 text-left text-sm ${FOCUS_RING} ${WAITING}`}
              onClick={() => !busy && onAsk(whyLevelQuestion(alert.hubName, alert.toLevel))}
              aria-disabled={busy || undefined}
              title={busy ? BUSY_HINT : undefined}
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
              className={`rounded px-1.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-200 ${FOCUS_RING}`}
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
