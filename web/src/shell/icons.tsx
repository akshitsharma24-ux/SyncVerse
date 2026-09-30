/** Tiny stroke icons (16px, currentColor). Decorative: always aria-hidden, labels live in the text next to them. */
import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  video: (
    <>
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="m15 10 6-3v10l-6-3z" />
    </>
  ),
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4" />,
  checklist: (
    <>
      <path d="m4 7 2 2 3-3.5M4 16l2 2 3-3.5" />
      <path d="M13 8h7M13 17h7" />
    </>
  ),
  bug: (
    <>
      <rect x="8" y="7" width="8" height="12" rx="4" />
      <path d="M12 7V4M8 11H4M16 11h4M8 16H5M16 16h3M9 4l1.5 2M15 4l-1.5 2" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.5M17.5 14.5a5 5 0 0 1 3 4.5" />
    </>
  ),
};

export function Icon({ name, size = 16 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
