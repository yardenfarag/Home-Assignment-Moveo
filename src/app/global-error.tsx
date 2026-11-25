"use client";
/**
 * Last-resort error boundary (Next.js `global-error.js`, B3): used when even the root layout
 * fails. It replaces the layout, so it brings its own <html>, <body> and styles.
 */
import { ErrorScreen } from "./_components/ErrorScreen";
import "./globals.css";

/**
 * Renders the fallback document.
 * @param props.error - what was thrown (logged, never shown).
 * @param props.retry - re-renders the app.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <title>Sneakoscope — something went wrong</title>
        <ErrorScreen error={error} retry={retry} where="app/global-error" />
      </body>
    </html>
  );
}
