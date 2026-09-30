/** Workspace top bar: brand, room code with invite link, who is here, demo samples slot, me, leave. Owner: Lane A. */
import { useEffect, useRef, useState } from 'react';
import { usePresence, useSession } from '../session';
import { useRoom } from '../room';
import { RoomDrawer } from './RoomDrawer';
import { SamplesMenu } from '../demo';
import { Logo } from './Logo';
import { Icon } from './icons';
import { PanelBoundary } from './PanelBoundary';
import { StatusChip } from './StatusChip';
import { ThemeToggle } from './ThemeToggle';

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

export function TopBar() {
  const { session, leave } = useSession();
  const people = usePresence();
  const { room, isOwner } = useRoom();
  const [drawer, setDrawer] = useState<'people' | 'history' | 'settings' | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  if (!session) return null;

  async function copyInvite() {
    const url = `${location.origin}/?room=${encodeURIComponent(session!.roomCode)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this invite link', url);
    }
    setCopied(true);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  }

  const shown = people.slice(0, 6);
  const extra = people.length - shown.length;

  return (
    <header className="topbar" data-testid="topbar">
      <Logo size={26} />
      <span style={{ width: 1, height: 22, background: 'var(--rule-soft)' }} />
      <button className="btn btn-outline btn-sm" onClick={copyInvite} title="Copy invite link" data-testid="copy-invite" style={{ gap: 8 }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>room</span>
        <span className="mono" style={{ fontSize: 12.5 }} data-testid="room-code">{session.roomCode}</span>
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
      <span aria-live="polite" style={{ fontSize: 12, color: 'var(--ok)', minWidth: 90 }}>{copied ? 'Invite link copied' : ''}</span>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
        <StatusChip />
        <ThemeToggle />
        <PanelBoundary name="samples" compact><SamplesMenu /></PanelBoundary>
        <button className="btn btn-outline btn-sm" onClick={() => setDrawer('history')} data-testid="history-open" aria-label="Version history" title="Version history">
          <Icon name="history" size={14} />
          <span className="hide-md">History</span>
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => setDrawer('people')} data-testid="room-open" aria-label={`Room: ${room?.members.filter((m) => !m.removed).length ?? 0} people, roles and settings`} title="People, roles and settings">
          <Icon name="users" size={14} />
          <span className="hide-md">Room</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center' }} aria-label={`${people.length} in this room`} data-testid="topbar-people">
          {shown.map((p) => (
            <span key={p.userId} className="avatar" data-state={p.state} data-topbar-presence={p.name} style={{ background: p.color }} title={`${p.name} (${p.role}) - ${p.state}`}>
              {initials(p.name)}
            </span>
          ))}
          {extra > 0 && (
            <span className="avatar" style={{ background: 'var(--ink)' }} title={`${extra} more`}>
              +{extra}
            </span>
          )}
        </div>
        <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
          <div style={{ fontSize: 13, fontWeight: 550 }}>{session.name}</div>
          <div className="eyebrow" style={{ fontSize: 10 }} data-testid="my-role">{isOwner ? `owner · ${session.role}` : session.role}</div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={leave}>Leave room</button>
      </div>
      {drawer && <RoomDrawer initialTab={drawer} onClose={() => setDrawer(null)} />}
    </header>
  );
}


