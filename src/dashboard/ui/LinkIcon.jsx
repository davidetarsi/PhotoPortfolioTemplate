import { linkIcon } from '../../shared/link-icons.js';

/** Decorative icon shared with the site footer. */
export function LinkIcon({ kind, size = 20 }) {
  const { d, filled } = linkIcon(kind);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="dash-link-icon">
      {filled
        ? <path d={d} fill="currentColor" />
        : <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
