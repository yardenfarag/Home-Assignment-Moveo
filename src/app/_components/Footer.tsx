/**
 * Data attribution (U7): Open-Meteo (CC BY 4.0) and FEMA, plus the one-line scope note.
 */

/** Renders the footer (one line on desktop; inside the Overview tab on small screens). */
export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`px-6 py-2 text-center text-[11px] leading-relaxed text-slate-500 ${className}`}>
      Weather data by{" "}
      <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-slate-300">
        Open-Meteo.com
      </a>{" "}
      (CC BY 4.0) · Hazard frequencies from the{" "}
      <a href="https://hazards.fema.gov/nri/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-slate-300">
        FEMA National Risk Index
      </a>{" "}
      · Scores measure weather exposure, not losses — decision support, not a decision.
    </footer>
  );
}
