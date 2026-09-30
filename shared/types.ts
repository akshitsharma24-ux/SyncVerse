/**
 * Contracts shared by every lane. Owner: Lane A.
 * Change rules: announce in the group chat first, prefer additive changes, never rename a field
 * another lane reads. See docs/PLAN section 4.2.
 */

export type Role = 'student' | 'mentor';

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
}

export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  role: Role;
  state: 'online' | 'typing' | 'idle';
}

// ---- Request identity (prototype: trusted headers, no login) -------------------------------------
export const HEADER_USER_ID = 'x-user-id';
export const HEADER_USER_NAME = 'x-user-name';
export const HEADER_ROLE = 'x-role';
