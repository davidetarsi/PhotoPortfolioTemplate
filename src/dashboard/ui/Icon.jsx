/** Small line icons, drawn inline (no external files, compatible with the CSP). */
const PATHS = {
  albums: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  site: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  messages: 'M3 6h18v12H3zM3 6l9 7 9-7',
};

/**
 * @param {{name: keyof PATHS, size?: number}} props
 */
export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
