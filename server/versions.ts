/**
 * Version history: saved copies of every file in a room. Owner: Lane A.
 * Stored next to the room's Yjs document as <code>.versions.json (newest last, at most 40; the oldest autosaves go first).
 * Restoring never rewrites history: the route saves a "Before restore" copy first, so a restore can itself be undone.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SnapshotFile, VersionInfo } from '@syncverse/shared';
import { roomsDir } from './paths';
import { logger } from './logger';

const log = logger('versions');
const MAX_VERSIONS = 40;

export interface StoredVersion extends VersionInfo {
  hash: string;
  files: SnapshotFile[];
}

const cache = new Map<string, StoredVersion[]>();
const fileFor = (code: string) => path.join(roomsDir(), `${code}.versions.json`);

function load(code: string): StoredVersion[] {
  let list = cache.get(code);
  if (list) return list;
  try {
    list = (JSON.parse(fs.readFileSync(fileFor(code), 'utf8')) as { versions?: StoredVersion[] }).versions ?? [];
  } catch {
    list = [];
  }
  cache.set(code, list);
  return list;
}

function persist(code: string): void {
  try {
    fs.mkdirSync(roomsDir(), { recursive: true });
    const tmp = fileFor(code) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ versions: load(code) }));
    fs.renameSync(tmp, fileFor(code));
  } catch (err) {
    log.error('could not save versions', { code, error: err });
  }
}

const strip = ({ hash: _h, files: _f, ...info }: StoredVersion): VersionInfo => info;

export const listVersions = (code: string): VersionInfo[] => [...load(code)].reverse().map(strip);
export const getVersion = (code: string, id: string): StoredVersion | undefined => load(code).find((v) => v.id === id);
export const contentHash = (files: SnapshotFile[]): string =>
  crypto
    .createHash('sha1')
    .update(JSON.stringify(files.map((f) => [f.id, f.name, f.language, f.content])))
    .digest('hex');

export function addVersion(
  code: string,
  input: { label: string; auto: boolean; by: { userId: string; name: string } | null; files: SnapshotFile[] },
): VersionInfo | null {
  const list = load(code);
  const hash = contentHash(input.files);
  if (input.auto && list.length && list[list.length - 1].hash === hash) return null; // nothing changed since the last copy
  const v: StoredVersion = {
    id: crypto.randomBytes(6).toString('hex'),
    label: input.label.trim().slice(0, 80) || (input.auto ? 'Autosave' : 'Saved version'),
    auto: input.auto,
    createdAt: Date.now(),
    by: input.by,
    fileCount: input.files.length,
    bytes: input.files.reduce((n, f) => n + Buffer.byteLength(f.content), 0),
    hash,
    files: input.files,
  };
  list.push(v);
  while (list.length > MAX_VERSIONS) {
    const i = list.findIndex((x) => x.auto);
    list.splice(i >= 0 ? i : 0, 1);
  }
  persist(code);
  return strip(v);
}

export function deleteVersions(code: string): void {
  cache.delete(code);
  try {
    fs.unlinkSync(fileFor(code));
  } catch {
    /* none */
  }
}
