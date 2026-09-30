/**
 * The file bar above the editor: one tab per file, "new file" and "upload", and actions for the open file
 * (language, rename, download, delete). Owner: Lane A.
 * The tab list holds only tabs (good for screen readers); the action buttons sit beside it, not inside it.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { LANGUAGES, MAX_FILES, languageFromName, type FileEntry } from '@syncverse/shared';
import { Dialog } from '../shell/Dialog';
import { Icon } from '../shell/icons';

export interface Others {
  userId: string;
  name: string;
  color: string;
}

export interface FileTabsProps {
  files: FileEntry[];
  activeId: string;
  canEdit: boolean;
  /** other people, by the file they have open */
  others: Record<string, Others[]>;
  onSelect: (id: string) => void;
  onCreate: (name: string, language?: string) => string | null;
  onRename: (id: string, name: string) => string | null;
  onDelete: (id: string) => string | null;
  onLanguage: (id: string, language: string) => void;
  onDownload: (id: string) => void;
  onUpload: (files: File[]) => void;
}

export function FileTabs(p: FileTabsProps) {
  const active = p.files.find((f) => f.id === p.activeId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLang, setNewLang] = useState('auto');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const atLimit = p.files.length >= MAX_FILES;

  useEffect(() => {
    if (creating) nameInput.current?.focus();
  }, [creating]);
  useEffect(() => {
    if (renaming) {
      renameInput.current?.focus();
      renameInput.current?.select();
    }
  }, [renaming]);
  // the file being renamed or deleted vanished (someone else deleted it): close the editors for it
  useEffect(() => {
    if (renaming && !p.files.some((f) => f.id === renaming)) setRenaming(null);
  }, [p.files, renaming]);

  function startRename(id = p.activeId) {
    const f = p.files.find((x) => x.id === id);
    if (!f || !p.canEdit) return;
    setError(null);
    setRenaming(id);
    setRenameTo(f.name);
  }

  function submitCreate() {
    const err = p.onCreate(newName, newLang === 'auto' ? undefined : newLang);
    if (err) return setError(err);
    setCreating(false);
    setNewName('');
    setNewLang('auto');
    setError(null);
  }

  function submitRename() {
    if (!renaming) return;
    const err = p.onRename(renaming, renameTo);
    if (err) return setError(err);
    setRenaming(null);
    setError(null);
  }

  // Arrow keys / Home / End move between tabs (roving focus); F2 renames.
  function onTabKey(e: KeyboardEvent, i: number) {
    const go = (n: number) => {
      e.preventDefault();
      const f = p.files[(n + p.files.length) % p.files.length];
      p.onSelect(f.id);
      requestAnimationFrame(() => document.getElementById(`ftab-${f.id}`)?.focus());
    };
    if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(p.files.length - 1);
    else if (e.key === 'F2') {
      e.preventDefault();
      startRename(p.files[i].id);
    }
  }

  const detected = newName.trim() ? languageFromName(newName.trim()) : undefined;

  return (
    <div data-testid="file-bar">
      <div className="filebar">
        <div className="ftabs" role="tablist" aria-label="Files" data-testid="file-tabs">
          {p.files.map((f, i) => {
            const here = p.others[f.id] ?? [];
            if (renaming === f.id) {
              return (
                <input
                  key={f.id}
                  ref={renameInput}
                  className="ftab-rename mono"
                  value={renameTo}
                  maxLength={40}
                  aria-label={`New name for ${f.name}`}
                  data-testid="file-rename-input"
                  onChange={(e) => {
                    setRenameTo(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename();
                    else if (e.key === 'Escape') {
                      setRenaming(null);
                      setError(null);
                    }
                  }}
                  onBlur={() => setRenaming(null)}
                />
              );
            }
            return (
              <button
                key={f.id}
                id={`ftab-${f.id}`}
                role="tab"
                className="ftab"
                aria-selected={f.id === p.activeId}
                tabIndex={f.id === p.activeId ? 0 : -1}
                data-testid="file-tab"
                data-file={f.name}
                title={p.canEdit ? `${f.name} (double-click or F2 to rename)` : f.name}
                onClick={() => p.onSelect(f.id)}
                onDoubleClick={() => startRename(f.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                <span className="mono">{f.name}</span>
                {here.length > 0 && (
                  <span className="ftab-here" aria-label={`${here.map((h) => h.name).join(', ')} ${here.length === 1 ? 'is' : 'are'} in this file`}>
                    {here.slice(0, 3).map((h) => (
                      <i key={h.userId} style={{ background: h.color }} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="filebar-actions">
          <button
            className="btn btn-outline btn-sm"
            style={{ width: 28, padding: 0 }}
            onClick={() => {
              setCreating((c) => !c);
              setError(null);
            }}
            disabled={!p.canEdit || atLimit}
            aria-label="New file"
            aria-expanded={creating}
            title={atLimit ? `A room can have at most ${MAX_FILES} files` : 'New file'}
            data-testid="file-new"
          >
            <Icon name="plus" size={14} />
          </button>
          <button className="btn btn-outline btn-sm" style={{ width: 28, padding: 0 }} onClick={() => fileInput.current?.click()} disabled={!p.canEdit || atLimit} aria-label="Upload files" title="Upload files (or drop them on the editor)" data-testid="file-upload">
            <Icon name="upload" size={14} />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            data-testid="file-upload-input"
            aria-label="Choose files to upload"
            onChange={(e) => {
              const list = [...(e.target.files ?? [])];
              e.target.value = '';
              if (list.length) p.onUpload(list);
            }}
          />
          <span className="filebar-sep" />
          <select
            className="lang-select"
            value={active?.language ?? 'plaintext'}
            disabled={!p.canEdit || !active}
            aria-label="Language of this file"
            data-testid="file-language"
            onChange={(e) => active && p.onLanguage(active.id, e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <button className="btn btn-outline btn-sm" onClick={() => startRename()} disabled={!p.canEdit || !active} aria-label="Rename file" title="Rename (F2)" data-testid="file-rename" style={{ width: 28, padding: 0 }}>
            <Icon name="pencil" size={14} />
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => active && p.onDownload(active.id)} disabled={!active} aria-label="Download file" title="Download this file" data-testid="file-download" style={{ width: 28, padding: 0 }}>
            <Icon name="download" size={14} />
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setConfirmDelete(true)}
            disabled={!p.canEdit || !active || p.files.length <= 1}
            aria-label="Delete file"
            title={p.files.length <= 1 ? 'A room needs at least one file' : 'Delete this file'}
            data-testid="file-delete"
            style={{ width: 28, padding: 0 }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      {creating && (
        <form
          className="filebar-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate();
          }}
          data-testid="file-new-form"
        >
          <input
            ref={nameInput}
            className="input mono"
            style={{ height: 30, fontSize: 13, width: 190 }}
            value={newName}
            maxLength={40}
            placeholder="name, e.g. helpers.py"
            aria-label="New file name"
            data-testid="file-new-name"
            onChange={(e) => {
              setNewName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
          />
          <select className="lang-select" value={newLang} onChange={(e) => setNewLang(e.target.value)} aria-label="Language of the new file" data-testid="file-new-language">
            <option value="auto">{detected ? `Detect: ${LANGUAGES.find((l) => l.id === detected)?.label}` : 'Detect from name'}</option>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-sm" data-testid="file-new-submit">
            Create file
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </form>
      )}
      {error && (
        <div role="alert" className="filebar-error" data-testid="file-error">
          {error}
        </div>
      )}

      {confirmDelete && active && (
        <Dialog title={`Delete ${active.name}?`} onClose={() => setConfirmDelete(false)} width={420} testId="file-delete-dialog">
          <p style={{ margin: '0 0 14px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            This removes <b className="mono">{active.name}</b> for everyone in the room. You can bring it back from Version history if you saved a version that has it.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setConfirmDelete(false)} data-autofocus>
              Keep file
            </button>
            <button
              className="btn btn-sm"
              data-testid="file-delete-confirm"
              onClick={() => {
                const err = p.onDelete(active.id);
                setConfirmDelete(false);
                setError(err);
              }}
            >
              Delete file
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
