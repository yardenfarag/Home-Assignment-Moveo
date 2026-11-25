"use client";
/**
 * Error boundary for the page (Next.js `error.js` convention, B3): if the app throws while
 * drawing, show a friendly page with Try again / Reload instead of a blank screen.
 */
import { ErrorScreen } from "./_components/ErrorScreen";

/**
 * Renders the fallback.
 * @param props.error - what was thrown (logged, never shown).
 * @param props.retry - re-renders the page.
 */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} where="app/error" />;
}
