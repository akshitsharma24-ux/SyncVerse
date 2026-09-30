import { useEffect, useState, type FormEvent } from 'react';
import type { Role, RoomSummary } from '@syncverse/shared';
import { api } from './api';
import { useAuth } from './auth';
import { useSession } from './session';
import { AccountButton } from './shell/Account';
import { Icon } from './shell/icons';
import { Dialog } from './shell/Dialog';
import { Brand } from './studio/Brand';
import { StudioPreview } from './studio/StudioPreview';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const makeCode = () => `studio-${['loop', 'array', 'node', 'graph', 'stack'][Math.floor(Math.random() * 5)]}-${Math.random().toString(36).slice(2, 7)}`;
function readRecent(): RoomSummary[] { try { return JSON.parse(localStorage.getItem('studio.recent') ?? '[]'); } catch { return []; } }

export default function JoinGate() {
  const { join } = useSession();
  const { account } = useAuth();
  const [params] = useState(() => new URLSearchParams(location.search));
  const [mode, setMode] = useState<'create' | 'join'>(params.has('room') ? 'join' : 'create');
  const [open, setOpen] = useState(params.has('room'));
  const [typedName, setName] = useState(() => { try { return params.get('name') ?? localStorage.getItem('studio.name') ?? ''; } catch { return ''; } });
  const name = account?.displayName ?? typedName;
  const [role, setRole] = useState<Role>(params.get('role') === 'mentor' ? 'mentor' : params.get('role') === 'viewer' ? 'viewer' : 'student');
  const [code, setCode] = useState(params.get('room') ?? '');
  const [generated, setGenerated] = useState(makeCode);
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState<RoomSummary[]>(readRecent);
  useEffect(() => { if (params.get('name') && params.get('room')) join({ name, role, roomCode: slug(params.get('room')!) }); }, []);
  useEffect(() => {
    if (!account) { setRooms(readRecent()); return; }
    if (!params.has('role')) setRole(account.defaultRole);
    let active = true;
    api.get<{ rooms: RoomSummary[] }>('/api/rooms').then(r => { if (active) setRooms(r.rooms.slice(0, 5)); }).catch(() => {});
    return () => { active = false; };
  }, [account?.id]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); } }), { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  function choose(next: 'create' | 'join') { setMode(next); setError(''); setOpen(true); }
  function enter(roomCode: string, selectedRole = role) {
    if (!name.trim()) { setError('Add your name so your classmates know it’s you.'); return; }
    try {
      localStorage.setItem('studio.name', name.trim());
      localStorage.setItem('studio.recent', JSON.stringify([{ code: roomCode, name: roomCode, role: selectedRole, lastActiveAt: Date.now(), owner: false, memberCount: 0 }, ...readRecent().filter(r => r.code !== roomCode)].slice(0, 5)));
    } catch { /* Storage is optional. */ }
    join({ name, role: selectedRole, roomCode });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const roomCode = mode === 'create' ? generated : slug(code);
    if (!roomCode) { setError('Enter the room code shared with you.'); return; }
    enter(roomCode);
  }
  return <div className="studio-landing">
    <a href="#main" className="skip-link">Skip to content</a>
    <header className="landing-nav"><a href="#" className="brand-link" aria-label="SyncVerse home"><Brand/></a><nav aria-label="Main navigation"><a href="#workspace-preview">Workspace</a><a href="#made-for-learning">The experience</a><a href="#how-it-works">How it works <span>↗</span></a></nav><div className="nav-actions"><AccountButton/></div></header>
    <main id="main">
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="hero-eyebrow"><span className="live-dot"/> LESS FRICTION. MORE FIGURING IT OUT.</div>
          <h1>A little curiosity.<br/>A lot of <em>possibility.</em></h1>
          <p>A shared space to code, get unstuck, and learn from each other.<br className="desktop-break"/> Bring an idea. Bring your people. See where it goes.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-grid"/><div className="orbit orbit-one"/><div className="orbit orbit-two"/>
          <div className="art-center"><span className="art-bracket">[</span><span className="art-asterisk">&#10035;</span><span className="art-bracket">]</span></div>
          <span className="art-label label-one"><span className="live-dot"/> your idea</span>
          <span className="art-label label-two">our next breakthrough <span>&#8599;</span></span>
          <span className="art-coordinate">01 / IN GOOD COMPANY</span>
          <div className="art-cursor"><svg width="19" height="23" viewBox="0 0 19 23"><path d="M2 2v17l5-5 5 7 3-2-5-7h7z" fill="currentColor"/></svg><span>you, together</span></div>
        </div>
        <div className="hero-entry">
          <div className="hero-actions" role="group" aria-label="Start coding together">
            <button className="btn studio-primary" data-testid="hero-create" onClick={() => choose('create')}><Icon name="plus" size={18}/> Create room <Icon name="arrow" size={17}/></button>
            <button className="btn btn-outline hero-join" data-testid="hero-join" onClick={() => choose('join')}><Icon name="users" size={18}/> Join room <Icon name="arrow" size={17}/></button>
          </div>
          <div className="hero-footnote"><Icon name="check" size={13}/> Start as a guest <span>&middot;</span> No setup. Just a shared link.</div>
        </div>
      </section>
      <StudioPreview onStart={() => choose('create')}/>
      <div className="language-strip"><span>A familiar language. A fresh perspective.</span><div><span>Python</span><i/><span>JavaScript</span><i/><span>Java</span><i/><span>C / C++</span><i/><span className="language-last">Your next idea ↗</span></div></div>
      <section className="experience-section reveal" id="made-for-learning"><div className="section-heading"><span className="section-kicker">01 — THE EXPERIENCE</span><h2>Space for the code.<br/><span>And the people behind it.</span></h2><p>Everything you need to find your flow,<br/>with a little help along the way.</p></div><div className="experience-grid"><article className="experience-card"><div className="feature-visual together-visual"><div className="mini-code">ideas <span>=</span> better_together<span>()</span></div><span className="visual-cursor cursor-one">↖ <b>You</b></span><span className="visual-cursor cursor-two">↖ <b>Your teammate</b></span></div><span className="feature-number">01 / CONNECT</span><h3>Same page. Same moment.</h3><p>Edit together in real time. See every cursor, talk it through, and turn “I’m stuck” into “I get it.”</p><div className="feature-tags"><span>Live editing</span><span>Voice & video</span></div></article><article className="experience-card"><div className="feature-visual understand-visual"><div className="error-line"><span>08</span> numbers[len(numbers)] <span className="small-error">!</span></div><div className="understand-hint"><Icon name="arrow" size={15}/><span>Try starting at zero.<br/><small>Lists count a little differently.</small></span></div></div><span className="feature-number">02 / UNDERSTAND</span><h3>The why behind the fix.</h3><p>Run privately, explore an error, and review a suggested patch. Build understanding with every attempt.</p><div className="feature-tags"><span>Private runs</span><span>Guided debugging</span></div></article><article className="experience-card"><div className="feature-visual growth-visual"><div className="growth-bars">{[24, 39, 32, 51, 47, 65, 57, 76, 88, 82, 100, 112].map((h, i) => <i key={i} style={{ height: h, animationDelay: `${i * 60}ms` }}/>)}</div><span className="growth-caption">A little further than yesterday <span>↗</span></span></div><span className="feature-number">03 / GROW</span><h3>Small steps. Real progress.</h3><p>See the concepts you’re practicing and invite a mentor in when you need another pair of eyes.</p><div className="feature-tags"><span>Learning progress</span><span>Mentor support</span></div></article></div></section>
      <section className="how-section reveal" id="how-it-works"><div><span className="section-kicker">02 — FIND YOUR FLOW</span><h2>From “what if”<br/>to <em>“it works.”</em></h2></div><div className="how-steps">{[['01', 'Make a little room.', 'Create a workspace and share the link with your people.'], ['02', 'Work it out together.', 'Write, run, talk, and follow each other’s thinking in real time.'], ['03', 'Leave knowing a little more.', 'Understand the errors. Keep the lessons. Come back curious.']].map(([n, title, body]) => <div key={n}><span>{n}</span><article><h3>{title}</h3><p>{body}</p></article><Icon name="arrow" size={17}/></div>)}</div></section>
      <section className="closing-section reveal"><div><span className="live-dot"/><span>YOUR NEXT “AHA” IS WAITING.</span></div><h2>Good things happen<br/>when we <em>figure it out together.</em></h2><button className="btn studio-primary" onClick={() => choose('create')}>Let’s build something <Icon name="arrow" size={17}/></button></section>
    </main><footer className="landing-footer"><Brand/><span>For curious minds. And the people who help them grow.</span><a href="#main">Back to top ↑</a></footer>
    {open && <Dialog title={mode === 'create' ? 'A fresh space for your next idea.' : 'Your people are waiting.'} onClose={() => { setOpen(false); if (params.has('room')) history.replaceState(null, '', location.pathname); }} width={460} testId="entry-dialog"><form className="studio-entry" onSubmit={submit} data-testid="entry-card"><p className="entry-description">{mode === 'create' ? 'Bring a little curiosity. We’ll take care of the workspace.' : 'Pick up the conversation with a shared room code.'}</p><div className="seg" role="group" aria-label="Create or join"><button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>Create a room</button><button type="button" aria-pressed={mode === 'join'} onClick={() => setMode('join')}>Join a room</button></div><label className="field"><span>Your name</span><input className="input" data-testid="entry-name" value={name} onChange={e => setName(e.target.value)} placeholder="What should we call you?" maxLength={40} required readOnly={Boolean(account)}/></label><div className="field"><span>I’m here as a</span><div className="seg" role="group" aria-label="Your role">{(['student', 'mentor', 'viewer'] as const).map(r => <button type="button" key={r} aria-pressed={role === r} onClick={() => setRole(r)}>{r === 'student' ? 'Learner' : r === 'mentor' ? 'Mentor' : 'Viewer'}</button>)}</div></div>{mode === 'create' ? <div className="field"><span>Your room code</span><div className="generated-code"><span className="mono" data-testid="entry-generated">{generated}</span><button type="button" className="btn btn-outline btn-sm" aria-label="Generate a different code" onClick={() => setGenerated(makeCode())}><Icon name="dice"/></button></div></div> : <label className="field"><span>Room code</span><input className="input mono" data-testid="entry-code" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. studio-loop-ab123" required maxLength={40}/></label>}{role === 'viewer' && <p className="entry-description">Watch, listen, and learn. Viewers don’t edit or run code.</p>}{error && <p role="alert" className="entry-error">{error}</p>}<button className="btn studio-primary btn-block" type="submit" data-testid="entry-submit">{mode === 'create' ? 'Create workspace' : 'Join workspace'}<Icon name="arrow"/></button><div className="entry-privacy"><Icon name="lock" size={12}/> Code together. Your runs stay private.</div>{rooms.length > 0 && <div className="recent-rooms"><span className="section-kicker">PICK UP WHERE YOU LEFT OFF</span>{rooms.slice(0, 3).map(r => <button type="button" key={r.code} onClick={() => enter(r.code, r.role)}><Icon name="history" size={14}/><span>{r.name}</span><Icon name="arrow" size={14}/></button>)}</div>}</form></Dialog>}
  </div>;
}
