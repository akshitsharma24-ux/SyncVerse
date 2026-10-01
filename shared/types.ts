/**
 * Contracts shared by every lane. Owner: Lane A.
 * Change rules: announce in the group chat first, prefer additive changes, never rename a field
 * another lane reads. See docs/PLAN section 4.2.
 */

/** viewer = read-only observer (cannot edit, cannot speak in the call). Added after the prototype; other lanes may ignore it. */
export type Role = 'student' | 'mentor' | 'viewer';

/** The only colours people (cursors, avatars) can have: each keeps white text at >= 4.5:1 and none is red (red = error). */
export const PEOPLE_COLORS = ['#1f5fbf', '#26794f', '#6b4fbb', '#b8531b', '#0b7477', '#a0522d', '#7a3e9d', '#3d6b99'] as const;

export interface SessionUser {
  userId: string; // uuid generated in the browser
  name: string;
  color: string; // hex, used for cursors and avatars
  role: Role;
  roomCode: string;
}

// ---- Lane B: running code -------------------------------------------------------------------
export type RunStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'compile_error'
  | 'runtime_error'
  | 'timeout'
  | 'memory_limit'
  | 'service_error';

export interface RunRequest {
  roomCode: string;
  language: string; // 'python' tonight; 'c' | 'cpp' | 'java' | 'javascript' if P-B5 lands
  source: string;
  stdin: string;
}

export interface RunResult {
  id: string;
  ownerId: string;
  roomCode: string;
  language: string;
  source: string;
  stdin: string;
  status: RunStatus;
  stdout: string;
  stderr: string;
  compileOutput: string;
  timeMs?: number;
  memoryKb?: number;
  errorLine?: number; // 1-based line in the student's source
  errorMessage?: string;
  createdAt: number;
}

// ---- Lane B: code quality ----------------------------------------------------------------------
export interface Diagnostic {
  category: 'formatting' | 'naming' | 'smell' | 'complexity' | 'security';
  severity: 'info' | 'warning' | 'error';
  line: number; // 1-based
  col?: number;
  rule: string;
  message: string;
}

// ---- Lane C: AI tutor --------------------------------------------------------------------------
export interface Explanation {
  what: string;
  whereLine?: number;
  why: string;
  plain: string;
  fix: string;
  snippet?: string;
  concepts: string[];
}

// ---- Lane D: debug access and progress -----------------------------------------------------------
export interface DebugGrant {
  id: string;
  ownerId: string; // the student whose session is requested
  granteeId: string; // the person asking (usually the mentor)
  granteeName: string;
  status: 'requested' | 'active' | 'denied' | 'revoked' | 'expired';
  createdAt: number;
  expiresAt?: number;
}

export interface LearningEvent {
  userId: string;
  roomCode: string;
  at: number;
  type: 'run' | 'explain' | 'patch' | 'lint' | 'debug_access';
  category?: string; // e.g. the error category of a failed run
  concepts?: string[];
  ok?: boolean;
}

// ---- Lane A: editor and presence --------------------------------------------------------------
export interface EditorMarker {
  line: number; // 1-based
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface EditorHandle {
  getValue(): string;
  /** Replaces the whole document. With Yjs this is ONE transaction so every collaborator gets it. */
  replaceAll(text: string): void;
  setMarkers(markers: EditorMarker[]): void;
  /** Pass null to clear the highlight. */
  highlightLine(line: number | null): void;
  /** Switch the open file to another language (a LanguageId). While the file is still a starter its code is swapped for the new language's starter. Optional so older stubs still fit. */
  setLanguage?(language: string): void;
}

export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  role: Role;
  state: 'online' | 'typing' | 'idle';
}

// ---- Request identity: a signed-in account (Authorization: Bearer) or a guest (headers, no proof) -----
export const HEADER_USER_ID = 'x-user-id';
export const HEADER_USER_NAME = 'x-user-name';
export const HEADER_ROLE = 'x-role';
/** Which room the request is about; lets the server apply the member's verified role instead of the claimed one. */
export const HEADER_ROOM = 'x-room';

// ---- Lane A: accounts, rooms and roles ------------------------------------------------------------------
/** What the server tells the browser about a signed-in account (never includes the password hash). */
export interface AccountProfile {
  id: string; // 'acct_...'; this is the userId everywhere once signed in
  username: string;
  displayName: string;
  color: string; // hex, cursor and avatar colour
  defaultRole: Exclude<Role, 'viewer'>;
  createdAt: number;
}

export interface MemberView {
  userId: string;
  name: string;
  role: Role;
  owner: boolean;
  /** A mentor paused this person's editing. */
  muted: boolean;
  /** Removed from the room by a mentor; cannot rejoin until allowed back. */
  removed: boolean;
  joinedAt: number;
  lastSeenAt: number;
}

export interface RoomView {
  code: string;
  name: string;
  ownerId: string;
  createdAt: number;
  /** When true, only the owner (and people the owner promotes) can join as a mentor. */
  lockMentorSeats: boolean;
  /** Mentors can freeze editing for every student at once. */
  frozen: boolean;
  members: MemberView[];
}

/** Summary row for the "your rooms" list on the entry page. */
export interface RoomSummary {
  code: string;
  name: string;
  role: Role;
  owner: boolean;
  lastActiveAt: number;
  memberCount: number;
}
