/**
 * Account button for the entry page: "Sign in" for guests, a name chip for signed-in people. Opens the sign-in / create-account
 * dialog or the profile dialog. Signing in is optional: guests can still create and join rooms. Owner: Lane A.
 */
import { useState, type FormEvent } from 'react';
import { PEOPLE_COLORS } from '@syncverse/shared';
import { changePassword, register, signIn, signOut, signOutEverywhere, updateProfile, useAuth, type AuthResult } from '../auth';
import { Dialog } from './Dialog';
import { Icon } from './icons';

type Role2 = 'student' | 'mentor';
const COLOR_NAMES: Record<string, string> = { '#1f5fbf': 'Blue', '#26794f': 'Green', '#6b4fbb': 'Purple', '#b8531b': 'Orange', '#0b7477': 'Teal', '#a0522d': 'Brown', '#7a3e9d': 'Plum', '#3d6b99': 'Steel blue' };

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

export function AccountButton() {
  const { account, ready } = useAuth();
  const [dialog, setDialog] = useState<'auth' | 'profile' | null>(null);
  const close = () => setDialog(null);
  return (
    <>
      {account ? (
        <button className="btn btn-outline btn-sm" onClick={() => setDialog('profile')} data-testid="profile-open" style={{ gap: 8 }} aria-label={`Your profile, signed in as ${account.displayName}`}>
          <span className="avatar" style={{ background: account.color, width: 20, height: 20, fontSize: 9, margin: 0, border: 0 }} aria-hidden>
            {initials(account.displayName)}
          </span>
          <span className="hide-sm">{account.displayName}</span>
        </button>
      ) : (
        <button className="btn btn-outline btn-sm" onClick={() => setDialog('auth')} disabled={!ready} data-testid="auth-open">
          <Icon name="user" size={14} /> Sign in
        </button>
      )}
      {dialog === 'auth' && <AuthDialog onClose={close} />}
      {dialog === 'profile' && account && <ProfileDialog onClose={close} />}
    </>
  );
}

function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role2>('student');
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r: AuthResult = mode === 'signin' ? await signIn(username, password) : await register({ username, password, displayName: displayName.trim() || undefined, defaultRole: role });
    setBusy(false);
    if (r.ok) onClose();
    else setError(r);
  }

  const bad = (f: string) => error?.field === f || undefined;

  return (
    <Dialog title={mode === 'signin' ? 'Sign in' : 'Create an account'} onClose={onClose} testId="auth-dialog">
      <div className="seg" role="group" aria-label="Sign in or create an account" style={{ marginBottom: 14 }}>
        <button type="button" aria-pressed={mode === 'signin'} onClick={() => { setMode('signin'); setError(null); }}>Sign in</button>
        <button type="button" aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError(null); }} data-testid="auth-mode-register">Create account</button>
      </div>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label className="field">
          <span>Username</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={24} required aria-invalid={bad('username')} data-testid="auth-username" />
        </label>
        {mode === 'register' && (
          <label className="field">
            <span>Name others see</span>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder="e.g. Asha" data-testid="auth-display-name" />
          </label>
        )}
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required aria-invalid={bad('password')} data-testid="auth-password" />
          {mode === 'register' && <small style={{ color: 'var(--muted)', fontSize: 12 }}>At least 8 characters.</small>}
        </label>
        {mode === 'register' && (
          <div className="field">
            <span>Usually I am a</span>
            <div className="seg" role="group" aria-label="Usual role">
              <button type="button" aria-pressed={role === 'student'} onClick={() => setRole('student')}>Student</button>
              <button type="button" aria-pressed={role === 'mentor'} onClick={() => setRole('mentor')}>Mentor</button>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" style={{ fontSize: 13, color: 'var(--danger)' }} data-testid="auth-error">
            {error.message}
          </div>
        )}
        <button className="btn btn-block" disabled={busy} data-testid="auth-submit">
          {busy ? 'One moment...' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>An account keeps your name, colour and room list on every device. You can always join as a guest instead.</p>
      </form>
    </Dialog>
  );
}

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { account } = useAuth();
  const [name, setName] = useState(account?.displayName ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!account) return null;

  async function save(patch: Parameters<typeof updateProfile>[0], done: string) {
    const r = await updateProfile(patch);
    setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.message });
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    const r = await changePassword(current, next);
    if (r.ok) {
      setCurrent('');
      setNext('');
      setPwMsg({ ok: true, text: 'Password changed. Other devices were signed out.' });
    } else setPwMsg({ ok: false, text: r.message });
  }

  return (
    <Dialog title="Your profile" onClose={onClose} testId="profile-dialog">
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)' }}>
        Signed in as <b className="mono" style={{ color: 'var(--ink)' }}>{account.username}</b>
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save({ displayName: name }, 'Name saved.');
        }}
        style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
      >
        <label className="field" style={{ flex: 1 }}>
          <span>Name others see</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required data-testid="profile-name" />
        </label>
        <button className="btn btn-outline" style={{ height: 40 }} disabled={!name.trim() || name.trim() === account.displayName} data-testid="profile-save">
          Save
        </button>
      </form>

      <div className="field" style={{ marginTop: 14 }}>
        <span>Colour of your cursor and avatar</span>
        <div className="swatches" role="radiogroup" aria-label="Colour">
          {PEOPLE_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={account.color === c} aria-label={COLOR_NAMES[c] ?? c} title={COLOR_NAMES[c]} className="swatch" style={{ background: c }} onClick={() => void save({ color: c }, 'Colour saved.')} />
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <span>Usually I am a</span>
        <div className="seg" role="group" aria-label="Usual role">
          {(['student', 'mentor'] as Role2[]).map((r) => (
            <button key={r} type="button" aria-pressed={account.defaultRole === r} onClick={() => void save({ defaultRole: r }, 'Usual role saved.')}>
              {r === 'student' ? 'Student' : 'Mentor'}
            </button>
          ))}
        </div>
      </div>
      {msg && (
        <div role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 10, fontSize: 13, color: msg.ok ? 'var(--ok)' : 'var(--danger)' }}>
          {msg.text}
        </div>
      )}

      <form onSubmit={savePassword} style={{ display: 'grid', gap: 10, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--rule-soft)' }}>
        <div className="eyebrow">Change password</div>
        <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" placeholder="Current password" aria-label="Current password" required />
        <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" placeholder="New password (8+ characters)" aria-label="New password" required />
        <button className="btn btn-outline btn-sm" style={{ justifySelf: 'start' }}>
          Change password
        </button>
        {pwMsg && (
          <div role={pwMsg.ok ? 'status' : 'alert'} style={{ fontSize: 13, color: pwMsg.ok ? 'var(--ok)' : 'var(--danger)' }}>
            {pwMsg.text}
          </div>
        )}
      </form>

      <div style={{ display: 'flex', gap: 8, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--rule-soft)', flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm"
          data-testid="profile-signout"
          onClick={() => {
            signOut();
            onClose();
          }}
        >
          Sign out
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={async () => {
            await signOutEverywhere();
            onClose();
          }}
        >
          Sign out on every device
        </button>
      </div>
    </Dialog>
  );
}
