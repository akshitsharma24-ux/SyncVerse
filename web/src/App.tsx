import { Suspense, lazy, useEffect } from 'react';
import { AppProviders, useSession } from './session';
import { isAccountId, useAuth } from './auth';
import { RoomProvider, useRoom } from './room';
import { connectionLooksSlow, hasChosen } from './lowbandwidth';
import { useToast } from './shell/toast';
import { Brand as Logo } from './studio/Brand';
import JoinGate from './JoinGate';
const StudioShell = lazy(() => import('./studio/StudioShell').then(module => ({ default: module.StudioShell })));
/** Shown instead of the workspace until the server has put me in the room, or when I cannot be in it. */
function RoomGate() {
  const { session, leave } = useSession();
  const { status, error, retry } = useRoom();
  const auth = useAuth();
  const toast = useToast();

  // A sign-in that ended while I was in a room (token expired, signed out in another tab): back to the start.
  useEffect(() => {
    if (session && isAccountId(session.userId) && auth.ready && !auth.account) leave();
  }, [session, auth.ready, auth.account, leave]);

  useEffect(() => {
    if (status === 'ready' && connectionLooksSlow() && !hasChosen()) toast('Your connection looks slow. Turn on low-bandwidth mode in Room, then Settings.', 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === 'ready') return <Suspense fallback={<div className="studio-loading" role="status"><span className="tiny-spinner"/> Opening your workspace…</div>}><StudioShell /></Suspense>;

  const copy =
    status === 'joining'
      ? { title: 'Joining the room...', body: 'Setting up your seat.' }
      : status === 'removed'
        ? { title: 'You were removed from this room', body: error ?? 'A mentor removed you, so you cannot edit or rejoin unless they allow it.' }
        : status === 'deleted'
          ? { title: 'This room was deleted', body: 'The owner deleted it. Its code and history are gone.' }
          : { title: 'Could not join the room', body: error ?? 'Something went wrong.' };
  return (
    <div className="page-frame" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="entry-card" style={{ padding: 24, maxWidth: 420, width: '100%', textAlign: 'center' }} role={status === 'joining' ? 'status' : 'alert'} data-testid="room-gate" data-status={status}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <Logo />
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 550, margin: '0 0 6px' }}>{copy.title}</h1>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>{copy.body}</p>
        {status !== 'joining' && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {status === 'error' && (
              <button className="btn btn-sm" onClick={retry}>
                Try again
              </button>
            )}
            <button className={`btn btn-sm ${status === 'error' ? 'btn-outline' : ''}`} onClick={leave} data-testid="room-gate-leave">
              Back to start
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Gate() {
  const { session } = useSession();
  return session ? (
    <RoomProvider>
      <RoomGate />
    </RoomProvider>
  ) : (
    <JoinGate />
  );
}

export default function App() {
  return (
    <AppProviders>
      <Gate />
    </AppProviders>
  );
}
