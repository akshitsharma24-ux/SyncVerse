/**
 * Entry page: create or join a room. Owner: Lane A.
 * Dev shortcut (used by the automated tests): /?name=Asha&role=mentor&room=loops-101 joins immediately.
 * Each browser TAB is a separate person (session lives in sessionStorage), so two tabs = two users.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Role, RoomSummary } from '@syncverse/shared';
import { api } from './api';
import { useAuth } from './auth';
import { setLowBandwidth, useLowBandwidth } from './lowbandwidth';
import { useSession } from './session';
import { AccountButton } from './shell/Account';
import { Logo } from './shell/Logo';
import { Icon } from './shell/icons';
import { ThemeToggle } from './shell/ThemeToggle';
import { HeroMock } from './landing/HeroMock';
import { Features } from './landing/Features';

const ADJ = ['swift', 'quiet', 'bright', 'calm', 'keen', 'lucky', 'steady', 'sunny', 'nimble', 'vivid'];
const NOUN = ['loop', 'array', 'stack', 'queue', 'graph', 'string', 'vector', 'bit', 'node', 'tuple'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const makeCode = () => `${pick(ADJ)}-${pick(NOUN)}-${Math.floor(10 + Math.random() * 90)}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

type Mode = 'create' | 'join';

const RECENT_KEY = 'sv.recent';
interface Recent {
  code: string;
  role: Role;
  at: number;
}
function readRecent(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((r) => r && typeof r.code === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}
function rememberRoom(code: string, role: Role): void {
  try {
    const next = [{ code, role, at: Date.now() }, ...readRecent().filter((r) => r.code !== code)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode: fine */
  }
}
const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString();
};

function readName(): string {
  try {
    return localStorage.getItem('syncverse.name') ?? '';
  } catch {
    return '';
  }
}

export default function JoinGate() {
  const { join } = useSession();
  const params = new URLSearchParams(location.search);
  const { account } = useAuth();
  const lowBw = useLowBandwidth();
  const [mode, setMode] = useState<Mode>(params.get('room') ? 'join' : 'create');
  const [typedName, setName] = useState(params.get('name') ?? readName());
  const name = account ? account.displayName : typedName; // a signed-in person's name comes from their profile
  const askedRole = params.get('role');
  const [role, setRole] = useState<Role>(askedRole === 'mentor' || askedRole === 'viewer' ? askedRole : 'student');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [code, setCode] = useState(params.get('room') ?? '');
  const [generated, setGenerated] = useState(makeCode);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (params.get('name') && params.get('room')) join({ name, role, roomCode: slug(params.get('room')!) || 'demo' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signing in: start from your usual role, and list the rooms you belong to (guests see the ones this browser opened last).
  useEffect(() => {
    if (!account) {
      setRooms(readRecent().map((r) => ({ code: r.code, name: r.code, role: r.role, owner: false, lastActiveAt: r.at, memberCount: 0 })));
      return;
    }
    if (!askedRole) setRole(account.defaultRole);
    let alive = true;
    api
      .get<{ rooms: RoomSummary[] }>('/api/rooms')
      .then((r) => alive && setRooms(r.rooms.slice(0, 6)))
      .catch(() => alive && setRooms([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  function choose(m: Mode) {
    setMode(m);
    setError(null);
    nameRef.current?.focus();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const roomCode = mode === 'create' ? generated : slug(code);
    if (!roomCode) {
      setError('Enter the room code your mentor or classmate shared.');
      return;
    }
    try {
      localStorage.setItem('syncverse.name', name.trim());
    } catch {
      /* private mode: fine */
    }
    rememberRoom(roomCode, role);
    join({ name, role, roomCode });
  }

  function reopen(r: RoomSummary) {
    rememberRoom(r.code, r.role);
    join({ name, role: r.role, roomCode: r.code });
  }

  return (
    <div className="page-frame">
      {/* nav */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 58, padding: '0 22px' }}>
        <Logo />
        <nav style={{ display: 'flex', alignItems: 'center', gap: 22, fontSize: 13.5 }} className="hide-md">
          <a href="#features" style={{ color: 'var(--ink-2)', textDecoration: 'none' }}>Features</a>
          <span className="eyebrow">PS 02 · remote STEM education</span>
        </nav>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-outline btn-sm"
            style={{ width: 32, padding: 0 }}
            aria-pressed={lowBw}
            aria-label="Low-bandwidth mode"
            title={lowBw ? 'Low-bandwidth mode is on (click to turn off)' : 'Low-bandwidth mode: audio-only calls, fewer updates, no animation'}
            data-testid="lowbw-toggle-entry"
            onClick={() => setLowBandwidth(!lowBw)}
          >
            <Icon name="signal" size={15} />
          </button>
          <ThemeToggle />
          <AccountButton />
          <button className="btn btn-outline btn-sm hide-sm" onClick={() => choose('join')}>Join a room</button>
          <button className="btn btn-sm" onClick={() => choose('create')}>Create a room</button>
        </div>
      </header>
      <div className="hatch" />

      {/* hero */}
      <section className="plusgrid" style={{ flex: 1 }}>
        <div className="hero-pad">
          <div style={{ textAlign: 'center', margin: '0 auto', maxWidth: 820 }}>
            <h1 className="headline">
              Learn to code together.
              <br />
              <span className="dim">Understand it on your own.</span>
            </h1>
            <p style={{ margin: '20px auto 0', maxWidth: 520, fontSize: 15.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
              Edit one program live with classmates and mentors, run it on your own, and get plain-English help the moment it breaks.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 44, alignItems: 'center', marginTop: 46 }} className="grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <form className="entry-card" onSubmit={submit} style={{ maxWidth: 470, width: '100%', padding: 18, justifySelf: 'center' }} data-testid="entry-card">
              <div className="seg" role="group" aria-label="Create or join">
                <button type="button" aria-pressed={mode === 'create'} onClick={() => choose('create')}>Create a room</button>
                <button type="button" aria-pressed={mode === 'join'} onClick={() => choose('join')}>Join a room</button>
              </div>

              <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
                <label className="field">
                  <span>Your name</span>
                  <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Asha" maxLength={40} required autoFocus readOnly={Boolean(account)} title={account ? 'Change your name in your profile' : undefined} data-testid="entry-name" />
                </label>

                <div className="field">
                  <span>I am a</span>
                  <div className="seg" role="group" aria-label="Role">
                    <button type="button" aria-pressed={role === 'student'} onClick={() => setRole('student')}>Student</button>
                    <button type="button" aria-pressed={role === 'mentor'} onClick={() => setRole('mentor')}>Mentor</button>
                    <button type="button" aria-pressed={role === 'viewer'} onClick={() => setRole('viewer')} data-testid="role-viewer">Viewer</button>
                  </div>
                  {role === 'viewer' && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>Viewers watch and listen but cannot edit.</div>}
                </div>

                {mode === 'create' ? (
                  <div className="field">
                    <span>Your room code</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div className="input code" style={{ display: 'flex', alignItems: 'center', background: 'var(--paper-2)' }} data-testid="entry-generated">{generated}</div>
                      <button type="button" className="btn btn-outline" style={{ height: 40 }} onClick={() => setGenerated(makeCode())} aria-label="Generate a different code" title="Different code">
                        <Icon name="dice" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="field">
                    <span>Room code</span>
                    <input
                      className="input code"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value);
                        setError(null);
                      }}
                      placeholder="e.g. swift-loop-42"
                      data-testid="entry-code"
                    />
                  </label>
                )}

                {error && (
                  <div role="alert" style={{ fontSize: 12.5, color: 'var(--danger)' }}>
                    {error}
                  </div>
                )}

                <button type="submit" className="btn btn-block" data-testid="entry-submit">
                  {mode === 'create' ? 'Create room' : 'Join room'}
                  <Icon name="arrow" />
                </button>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
                  {account ? `Signed in as ${account.username}.` : 'No account needed.'} {mode === 'create' ? 'Share the code, or the invite link inside the room.' : 'Your camera and mic start only when you join the call.'}
                </div>
              </div>
              {rooms.length > 0 && (
                <section aria-label={account ? 'Your rooms' : 'Recent rooms'} style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--rule-soft)' }} data-testid="room-list">
                  <div className="eyebrow" style={{ marginBottom: 6 }}>{account ? 'Your rooms' : 'Recent rooms on this device'}</div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {rooms.map((r) => (
                      <li key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                          <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                            {r.code} · {r.owner ? 'owner' : r.role} · {ago(r.lastActiveAt)}
                          </div>
                        </div>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => reopen(r)} aria-label={`Open ${r.name}`} data-testid="room-open-row">
                          Open
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </form>

            {lowBw ? (
              <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }} data-testid="lowbw-note">
                <div className="eyebrow" style={{ marginBottom: 6 }}>Low-bandwidth mode is on</div>
                The live demo is hidden to save data. In a room, calls join with audio only and animations are off.
              </div>
            ) : (
              <HeroMock />
            )}
          </div>
        </div>
      </section>

      <div className="hatch" />
      <Features />
      <div className="hatch thin" />
      <footer style={{ padding: '12px 22px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }} className="eyebrow">
        <span>SyncVerse · collaborative real-time code editor for remote STEM education</span>
        <span>Shared code, private execution</span>
      </footer>
    </div>
  );
}
