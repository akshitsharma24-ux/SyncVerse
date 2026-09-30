/**
 * The room drawer: People (roles and moderation), History (saved versions), Settings. Owner: Lane A.
 * Everything here talks to /api/rooms/... (see server/routes/rooms.ts); the server decides who may do what, this only shows
 * the buttons that will work for the current person.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MemberView, Role, SnapshotFile, VersionInfo } from '@syncverse/shared';
import { api, errorMessage } from '../api';
import { setLowBandwidth, useLowBandwidth } from '../lowbandwidth';
import { useRoom } from '../room';
import { usePresence, useSessionUser } from '../session';
import { Dialog } from './Dialog';
import { useToast } from './toast';

type Tab = 'people' | 'history' | 'settings';

const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

export function RoomDrawer({ initialTab = 'people', onClose }: { initialTab?: Tab; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { room } = useRoom();
  const tabs: Array<[Tab, string]> = [
    ['people', `People${room ? ` (${room.members.filter((m) => !m.removed).length})` : ''}`],
    ['history', 'History'],
    ['settings', 'Settings'],
  ];
  return (
    <Dialog title={room?.name ?? 'Room'} variant="drawer" onClose={onClose} testId="room-drawer">
      <div className="seg" role="group" aria-label="Room sections" style={{ marginBottom: 14 }}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} data-testid={`room-tab-${id}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'people' && <People />}
      {tab === 'history' && <History />}
      {tab === 'settings' && <Settings onDeleted={onClose} />}
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------ people
function People() {
  const me = useSessionUser();
  const { room, isOwner, isModerator, setMember, setSettings, muteAudio } = useRoom();
  const here = new Set(usePresence().map((p) => p.userId));
  const toast = useToast();
  if (!room) return null;

  const run = async (p: Promise<string | null>, ok?: string) => {
    const err = await p;
    if (err) toast(err, 'error');
    else if (ok) toast(ok, 'ok');
  };
  const mic = async (userId?: string) => {
    const r = await muteAudio(userId);
    if (r.error) toast(r.error, 'error');
    else toast(r.muted ? `Muted ${r.muted} microphone${r.muted > 1 ? 's' : ''}.` : 'Nobody who is in the call had a microphone on.', r.muted ? 'ok' : 'info');
  };

  const members = room.members.filter((m) => !m.removed);
  const removed = room.members.filter((m) => m.removed);

  const row = (m: MemberView) => {
    const mine = m.userId === me.userId;
    const canAct = isModerator && !mine && !m.owner && (isOwner || m.role !== 'mentor');
    return (
      <li key={m.userId} className="member" data-testid="member-row" data-member={m.name} data-role={m.role}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <i aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: here.has(m.userId) ? 'var(--ok)' : 'var(--soft)' }} />
          <span style={{ fontWeight: 550, fontSize: 13.5 }}>{m.name}</span>
          {mine && <span style={{ color: 'var(--muted)', fontSize: 12 }}>(you)</span>}
          <span className="badge">{m.role}</span>
          {m.owner && <span className="badge solid">owner</span>}
          {m.muted && <span className="badge warn">editing paused</span>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{here.has(m.userId) ? 'here now' : `seen ${ago(m.lastSeenAt)}`}</span>
        </div>
        {canAct && (
          <div className="member-actions">
            <select
              className="plain-select"
              value={m.role}
              aria-label={`Role for ${m.name}`}
              data-testid="member-role"
              onChange={(e) => void run(setMember(m.userId, { role: e.target.value as Role }), `${m.name} is now ${e.target.value === 'viewer' ? 'a viewer' : 'a ' + e.target.value}.`)}
            >
              <option value="viewer">Viewer (watch only)</option>
              <option value="student">Student</option>
              {isOwner && <option value="mentor">Mentor</option>}
            </select>
            <button className="btn btn-outline btn-sm" data-testid="member-pause" onClick={() => void run(setMember(m.userId, { muted: !m.muted }), m.muted ? `${m.name} can edit again.` : `Paused ${m.name}'s editing.`)}>
              {m.muted ? 'Resume editing' : 'Pause editing'}
            </button>
            <button className="btn btn-outline btn-sm" data-testid="member-mute-mic" onClick={() => void mic(m.userId)}>
              Mute mic
            </button>
            <button className="btn btn-outline btn-sm" data-testid="member-remove" onClick={() => void run(setMember(m.userId, { removed: true }), `Removed ${m.name}.`)}>
              Remove
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div data-testid="people-tab">
      {isModerator && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <button className="btn btn-outline btn-sm" aria-pressed={room.frozen} data-testid="room-freeze" onClick={() => void run(setSettings({ frozen: !room.frozen }), room.frozen ? 'Editing is back on.' : 'Froze editing for students.')}>
            {room.frozen ? 'Unfreeze editing' : 'Freeze editing for students'}
          </button>
          <button className="btn btn-outline btn-sm" data-testid="room-mute-all" onClick={() => void mic()}>
            Mute every student's mic
          </button>
        </div>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Members">
        {members.map(row)}
      </ul>
      {removed.length > 0 && (
        <>
          <div className="eyebrow" style={{ margin: '16px 0 4px' }}>Removed</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Removed members">
            {removed.map((m) => (
              <li key={m.userId} className="member" data-testid="removed-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13.5 }}>{m.name}</span>
                {isModerator && (isOwner || m.role !== 'mentor') && (
                  <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} data-testid="member-allow" onClick={() => void run(setMember(m.userId, { removed: false }), `${m.name} can rejoin.`)}>
                    Allow back
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {!isModerator && <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 14 }}>Mentors can change roles, pause editing and mute microphones.</p>}
    </div>
  );
}

// ----------------------------------------------------------------------------------------------- history
function History() {
  const me = useSessionUser();
  const { canEdit, readOnlyReason } = useRoom();
  const toast = useToast();
  const base = `/api/rooms/${encodeURIComponent(me.roomCode)}/versions`;
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ id: string; files: SnapshotFile[]; file: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setVersions((await api.get<{ versions: VersionInfo[] }>(base)).versions);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      await api.post(base, { label });
      setLabel('');
      toast('Version saved.', 'ok');
      await load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function show(id: string) {
    if (preview?.id === id) return setPreview(null);
    try {
      const r = await api.get<{ files: SnapshotFile[] }>(`${base}/${id}`);
      setPreview({ id, files: r.files, file: r.files[0]?.id ?? '' });
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  async function restore(id: string) {
    setBusy(true);
    try {
      await api.post(`${base}/${id}/restore`);
      toast('Restored. A "Before restore" copy was saved, so you can undo this.', 'ok');
      setConfirming(null);
      await load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="history-tab">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        style={{ display: 'flex', gap: 8, marginBottom: 6 }}
      >
        <input className="input" style={{ height: 34, fontSize: 13 }} value={label} maxLength={80} placeholder="Name this version (optional)" aria-label="Version name" data-testid="version-label" onChange={(e) => setLabel(e.target.value)} />
        <button className="btn btn-sm" style={{ height: 34 }} disabled={busy || me.role === 'viewer'} data-testid="version-save">
          Save version
        </button>
      </form>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>Copies of every file are also saved automatically every 5 minutes while you work, and when the last person leaves.</p>
      {error && (
        <div role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {versions && versions.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>No versions yet. Save one before trying something risky.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Saved versions">
        {(versions ?? []).map((v) => (
          <li key={v.id} className="version" data-testid="version-row" data-label={v.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 550, fontSize: 13.5 }}>{v.label}</span>
              {v.auto && <span className="badge">auto</span>}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{ago(v.createdAt)}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {v.fileCount} file{v.fileCount === 1 ? '' : 's'}
              {v.by ? ` · saved by ${v.by.name}` : ''}
            </div>
            <div className="member-actions">
              <button className="btn btn-outline btn-sm" data-testid="version-preview" aria-expanded={preview?.id === v.id} onClick={() => void show(v.id)}>
                {preview?.id === v.id ? 'Hide preview' : 'Preview'}
              </button>
              {confirming === v.id ? (
                <>
                  <button className="btn btn-sm" disabled={busy} data-testid="version-restore-confirm" onClick={() => void restore(v.id)}>
                    Confirm restore
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="btn btn-outline btn-sm" disabled={!canEdit} title={canEdit ? 'Put this version back for everyone' : readOnlyReason ?? ''} data-testid="version-restore" onClick={() => setConfirming(v.id)}>
                  Restore
                </button>
              )}
            </div>
            {preview?.id === v.id && (
              <div data-testid="version-preview-body">
                <select className="plain-select" style={{ marginTop: 8 }} value={preview.file} aria-label="File to preview" onChange={(e) => setPreview({ ...preview, file: e.target.value })}>
                  {preview.files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <pre className="preview" tabIndex={0} aria-label="Preview of the saved file">
                  {preview.files.find((f) => f.id === preview.file)?.content || '(empty file)'}
                </pre>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- settings
function Settings({ onDeleted }: { onDeleted: () => void }) {
  const { room, isOwner, setSettings, deleteRoom } = useRoom();
  const toast = useToast();
  const low = useLowBandwidth();
  const [name, setName] = useState(room?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!room) return null;

  async function rename() {
    const err = await setSettings({ name });
    toast(err ?? 'Room renamed.', err ? 'error' : 'ok');
  }

  return (
    <div data-testid="settings-tab">
      <label className="field" style={{ marginBottom: 6 }}>
        <span>Room name</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ height: 34, fontSize: 13 }} value={name} maxLength={60} disabled={!isOwner} data-testid="room-name" onChange={(e) => setName(e.target.value)} />
          {isOwner && (
            <button className="btn btn-outline btn-sm" style={{ height: 34 }} disabled={!name.trim() || name.trim() === room.name} onClick={() => void rename()} data-testid="room-rename">
              Save name
            </button>
          )}
        </div>
      </label>
      {!isOwner && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>Only the owner can rename the room.</p>}

      <label className="setting">
        <input type="checkbox" checked={room.lockMentorSeats} disabled={!isOwner} data-testid="room-lock-mentors" onChange={(e) => void setSettings({ lockMentorSeats: e.target.checked }).then((err) => err && toast(err, 'error'))} />
        <span>
          Lock mentor seats
          <small>New people who ask to join as a mentor become students until you promote them. Mentors already in the room keep their seat.</small>
        </span>
      </label>

      <label className="setting">
        <input type="checkbox" checked={low} data-testid="lowbw-toggle" onChange={(e) => setLowBandwidth(e.target.checked)} />
        <span>
          Low-bandwidth mode (this device)
          <small>For a weak connection. The video call joins with audio only, cursor positions are sent less often, and animations stop. Typing stays instant.</small>
        </span>
      </label>

      {isOwner && (
        <div style={{ marginTop: 18 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setConfirmDelete(true)} data-testid="room-delete" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
            Delete this room
          </button>
        </div>
      )}
      {confirmDelete && (
        <Dialog title="Delete this room?" onClose={() => setConfirmDelete(false)} width={420} testId="room-delete-dialog">
          <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            Everyone is disconnected and the room code, its files and its version history are deleted for good. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setConfirmDelete(false)} data-autofocus>
              Keep room
            </button>
            <button
              className="btn btn-sm"
              data-testid="room-delete-confirm"
              onClick={async () => {
                const err = await deleteRoom();
                if (err) toast(err, 'error');
                else onDeleted();
                setConfirmDelete(false);
              }}
            >
              Delete room
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
