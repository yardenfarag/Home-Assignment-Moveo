/**
 * Data attribution (U7): Open-Meteo (CC BY 4.0) and FEMA, plus the one-line scope note.
 */

/** Renders the footer. */
export function Footer() {
  return (
    <footer className="border-t border-white/5 px-6 py-4 text-center text-[11px] leading-relaxed text-slate-500">
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
