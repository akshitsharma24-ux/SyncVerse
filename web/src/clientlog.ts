/**
 * Sends the browser's own crashes to the server log (POST /api/client-log), so "it broke on Rahil's laptop" shows up in
 * the same place as server errors. At most 10 distinct reports per page load; failures to report are ignored.
 */
const seen = new Set<string>();

export function reportError(message: string, where?: string, stack?: string): void {
  const key = `${message}|${where ?? ''}`;
  if (seen.has(key) || seen.size >= 10) return;
  seen.add(key);
  try {
    void fetch('/api/client-log', {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: message.slice(0, 500), where: where?.slice(0, 200), stack: stack?.slice(0, 2000) }),
    }).catch(() => {});
  } catch {
    /* never let reporting break the app */
  }
}

export function initClientLog(): void {
  window.addEventListener('error', (e) => reportError(e.message || 'script error', `${e.filename}:${e.lineno}`, e.error?.stack));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    reportError(r instanceof Error ? r.message : String(r), 'unhandledrejection', r instanceof Error ? r.stack : undefined);
  });
}
