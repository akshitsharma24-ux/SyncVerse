/** Lane D (Miti): T-D-09 stuck nudge. After 3 failed runs in a row the STUDENT gets a private prompt. Nothing is exposed until they choose. */
import { useEffect, useState } from 'react';
import { api } from '../api';

export function Nudge({ roomCode }: { roomCode: string }) {
  const [streak, setStreak] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(0); // streak length at which the student said "not now"
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = () =>
      api.get<{ streak: number }>('/api/progress/me?room=' + encodeURIComponent(roomCode)).then((d) => !stop && setStreak(d.streak)).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [roomCode]);

  useEffect(() => {
    if (streak === 0) setAsked(false);
  }, [streak]);

  if (asked) {
    return (
      <div role="status" style={{ fontSize: 12, color: 'var(--muted)' }} data-testid="nudge-sent">
        Your mentor can now see you asked for help. They still cannot see your code unless you allow it.
      </div>
    );
  }
  if (streak < 3 || streak <= dismissedAt) return null;
  return (
    <div role="alert" data-testid="nudge" style={{ border: '1px solid var(--ink)', borderRadius: 4, padding: 10, fontSize: 13 }}>
      <b>Stuck on the same problem?</b> Your last {streak} runs failed. Want to let your mentor know?
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-sm" data-testid="nudge-ask" onClick={() => api.post('/api/help', { roomCode }).then(() => setAsked(true)).catch(() => {})}>
          Ask for help
        </button>
        <button className="btn btn-outline btn-sm" data-testid="nudge-dismiss" onClick={() => setDismissedAt(streak)}>
          Not now
        </button>
      </div>
    </div>
  );
}
