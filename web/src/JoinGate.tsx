/**
 * Entry page: create or join a room. Owner: Lane A.
 * Dev shortcut (used by the automated tests): /?name=Asha&role=mentor&room=loops-101 joins immediately.
 * Each browser TAB is a separate person (session lives in sessionStorage), so two tabs = two users.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Role } from '@syncverse/shared';
import { useSession } from './session';
import { Logo } from './shell/Logo';
import { Icon } from './shell/icons';
import { HeroMock } from './landing/HeroMock';
import { Features } from './landing/Features';

const ADJ = ['swift', 'quiet', 'bright', 'calm', 'keen', 'lucky', 'steady', 'sunny', 'nimble', 'vivid'];
const NOUN = ['loop', 'array', 'stack', 'queue', 'graph', 'string', 'vector', 'bit', 'node', 'tuple'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const makeCode = () => `${pick(ADJ)}-${pick(NOUN)}-${Math.floor(10 + Math.random() * 90)}`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

type Mode = 'create' | 'join';

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
  const [mode, setMode] = useState<Mode>(params.get('room') ? 'join' : 'create');
  const [name, setName] = useState(params.get('name') ?? readName());
  const [role, setRole] = useState<Role>(params.get('role') === 'mentor' ? 'mentor' : 'student');
  const [code, setCode] = useState(params.get('room') ?? '');
  const [generated, setGenerated] = useState(makeCode);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (params.get('name') && params.get('room')) join({ name, role, roomCode: slug(params.get('room')!) || 'demo' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    join({ name, role, roomCode });
  }

  return (
    <div className="frame">
      {/* nav */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 58, padding: '0 22px' }}>
        <Logo />
        <nav style={{ display: 'flex', alignItems: 'center', gap: 22, fontSize: 13.5 }} className="hide-md">
          <a href="#features" style={{ color: 'var(--ink-2)', textDecoration: 'none' }}>Features</a>
          <span className="eyebrow">PS 02 · remote STEM education</span>
        </nav>
        <div style={{ display: 'flex', gap: 8 }}>
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
                  <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Asha" maxLength={40} required autoFocus data-testid="entry-name" />
                </label>

                <div className="field">
                  <span>I am a</span>
                  <div className="seg" role="group" aria-label="Role">
                    <button type="button" aria-pressed={role === 'student'} onClick={() => setRole('student')}>Student</button>
                    <button type="button" aria-pressed={role === 'mentor'} onClick={() => setRole('mentor')}>Mentor</button>
                  </div>
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
                  No account needed. {mode === 'create' ? 'Share the code, or the invite link inside the room.' : 'Your camera and mic start only when you join the call.'}
                </div>
              </div>
            </form>

            <HeroMock />
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


