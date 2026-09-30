export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="studio-brand"><svg width="29" height="29" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m13 5-9 11 9 11M19 5l9 11-9 11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="m18 11-4 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>{!compact && <span>syncverse<span className="brand-period">.</span></span>}</span>;
}
