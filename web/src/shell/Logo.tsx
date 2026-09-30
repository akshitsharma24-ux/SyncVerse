/** SyncVerse mark: two text cursors in two people's colours inside a hairline circle. */
export function Logo({ size = 28, name = true }: { size?: number; name?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="14.75" fill="none" stroke="#151515" strokeWidth="1.5" />
        {/* cursor 1 */}
        <rect x="10.2" y="8.5" width="2.2" height="13" rx="1.1" fill="#1f5fbf" />
        <rect x="10.2" y="8.5" width="6.4" height="3.6" rx="1" fill="#1f5fbf" />
        {/* cursor 2 */}
        <rect x="19.6" y="10.5" width="2.2" height="13" rx="1.1" fill="#d9692b" />
        <rect x="15.4" y="19.9" width="6.4" height="3.6" rx="1" fill="#d9692b" />
      </svg>
      {name && <span style={{ fontWeight: 600, letterSpacing: '-0.02em', fontSize: size * 0.6 }}>SyncVerse</span>}
    </span>
  );
}
