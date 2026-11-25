/**
 * Sneakoscope icon (original artwork): a glass spinning top with a glowing amber
 * core and an alert spark — "it lights up when something's wrong".
 * Pure SVG; gradient ids are unique per instance so several icons can coexist.
 */
import { useId } from "react";

/** Props for {@link SneakoscopeIcon}. */
interface SneakoscopeIconProps {
  /** Rendered size in pixels (square). */
  size?: number;
  /** Adds a soft pulsing glow (respects reduced motion). */
  glowing?: boolean;
  className?: string;
}

/** Renders the icon. Decorative by default (aria-hidden). */
export function SneakoscopeIcon({ size = 28, glowing = false, className }: SneakoscopeIconProps) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`${id}-glass`} x1="12" y1="18" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.55" />
          <stop offset="1" stopColor="#6366f1" stopOpacity="0.25" />
        </linearGradient>
        <radialGradient id={`${id}-core`} cx="32" cy="34" r="12" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="0.45" stopColor="#fbbf24" stopOpacity="0.85" />
          <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* stem */}
      <rect x="29" y="6" width="6" height="12" rx="2.5" fill="#cbd5e1" />
      <rect x="27" y="15" width="10" height="4" rx="2" fill="#94a3b8" />
      {/* glass body */}
      <path d="M12 29C12 19 52 19 52 29C52 39 41 48 32 58C23 48 12 39 12 29Z" fill={`url(#${id}-glass)`} stroke="#7dd3fc" strokeWidth="2" strokeLinejoin="round" />
      {/* spin band */}
      <ellipse cx="32" cy="29" rx="19" ry="4.5" stroke="#bae6fd" strokeOpacity="0.7" strokeWidth="1.5" />
      {/* glowing core */}
      <circle cx="32" cy="34" r="12" fill={`url(#${id}-core)`} className={glowing ? "animate-pulse motion-reduce:animate-none" : undefined} />
      {/* alert spark */}
      <path d="M50 10L51.6 14.4L56 16L51.6 17.6L50 22L48.4 17.6L44 16L48.4 14.4Z" fill="#fde68a" />
    </svg>
  );
}
