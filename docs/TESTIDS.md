# UI test contract (data-testid)

`npm run e2e:golden` plays the whole demo with three browsers (mentor Asha, students Ravi and Mei). It finds your UI only through
the `data-testid` names below, so **put these exact names on your elements**. A step whose panel root is missing is reported as
SKIP ("not built yet"); once the root exists the step runs for real and fails loudly if a name below is missing or wrong.

Rules: names are exact, lower-case with hyphens; attributes are exact; extra testids are always fine.
**Every lane names its panel root `<name>-panel`** (run-panel, quality-panel, ai-panel, debug-panel, progress-panel). Add the root first:
it is how the test knows a panel is real and not the placeholder.

## Lane B: Simrit (console and quality) - NOT BUILT YET

| data-testid | What it is | Required attributes / content |
|---|---|---|
| `run-panel` | root of the console panel | |
| `stdin-input` | the stdin text box | fillable (`input` or `textarea`) |
| `run-btn` | runs the current editor text | click starts a run (Lane B's real name) |
| `run-status` | status badge of the latest run | `data-status` = the RunStatus value (`success`, `runtime_error`, `compile_error`, `timeout`, `memory_limit`, `service_error`, `queued`, `running`) and `data-run-id` = the run id. Text is human ("Runtime error") |
| `run-stdout` | stdout of the latest run | text content is the output; shown while the stdout tab is selected (default) |
| `run-stderr` | stderr of the latest run | text content; shown while the stderr tab (`tab-stderr`) is selected |
| `quality-panel` | root of the quality panel | |
| `quality-group` / `quality-item` | one group per category (`data-category`: formatting, naming, smell, complexity, security), one `quality-item` per finding (`data-rule`, `data-line`) | |

Error marking: after a failed run call `useEditor().setMarkers(...)`; the test looks for Monaco's `.squiggly-error`.
Miti's debug mirror reads `GET /api/runs/latest?ownerId=` from you, so that route must exist and respect `canView`.

## Lane C: Rahil (AI) - NOT BUILT YET

| data-testid | What it is | Required attributes / content |
|---|---|---|
| `ai-panel` | root of the AI panel | |
| `explain-button` | "Explain with AI" for the latest run | |
| `explain-card` | the finished explanation | visible, with readable text (what / where / why / fix) |
| `patch-show` | "Show patch" | opens the diff preview |
| `patch-diff` | the diff preview | visible while open |
| `patch-accept` | Accept | applies via `useEditor().replaceAll(...)`; everyone's editor updates |
| `patch-reject` | Reject | closes the preview; the editor text must be exactly unchanged |

## Lane D: Miti (debug, progress, samples) - BUILT AND MERGED

These are Miti's real names; the golden test uses them today.

| data-testid | What it is |
|---|---|
| `debug-panel` | root of the debug panel |
| `request-<userId>` | "Request access" button for one person (the mentor side) |
| `access-modal` | the prompt shown to the OWNER when someone asks; buttons `allow`, `allow-assist`, `deny`, `block` |
| `viewing-banner` | shown to the OWNER while someone is viewing; button `revoke` |
| `mirror` | the VIEWER's read-only copy of the owner's latest run; removed as soon as access ends |
| `pointed`, `hl-line`, `hl-send` | assist scope: the viewer points at a line, the owner sees it |
| `overview`, `tile-<Name>`, `help-flag`, `broadcast-input`, `broadcast-send`, `broadcast-banner` | mentor overview tiles (status only), help flag, room broadcast |
| `nudge`, `nudge-ask`, `nudge-dismiss`, `nudge-sent` | the "Ask for help?" prompt after three failures |
| `progress-panel` | root of the progress page |
| `observations` | the list of observation sentences (`li` per sentence) |
| `trend`, `concepts`, `suggestions`, `mentor-table`, `trends` | other progress sections |
| `samples-btn` | the Samples button in the top bar |
| `samples-menu` | the open menu; items have role `menuitem` and are labelled from `docs/samples/*.py` ("Index Error", "Stdin Average", ...), plus "Load demo history" and `reset-demo` |

Server privacy (checked by the golden test through the API): `GET /api/run/<id>` returns 403 for anyone who is not the owner or
an active grantee, 200 for the owner and for an active grantee, and 403 again after revoke.

## Already provided by the shell (Lane A): do not rename

`topbar`, `room-code`, `copy-invite`, `topbar-people`, `editor-status`, `presence-strip` (children carry `data-presence="Name:state"`),
`data-topbar-presence="Name"` on avatars, `status-chip` (`data-state`), `status-popover`, `toast` (`data-kind`), `entry-card`, `entry-name`,
`entry-code`, `entry-generated`, `entry-submit`, `theme-toggle` (`data-theme-now`), `video-join`, `video-error`, `video-live`, `panel-crash` (+ `data-panel`).
Files and rooms (Lane A): `file-bar`, `file-tabs`, `file-tab` (`data-file="name"`), `file-new`, `file-new-form`, `file-new-name`, `file-new-language`, `file-new-submit`, `file-upload`, `file-upload-input`, `file-language`, `file-rename`, `file-rename-input`, `file-download`, `file-delete`, `file-delete-dialog`, `file-delete-confirm`, `file-error`, `readonly-banner`, `editor-host`, `room-open`, `room-drawer`, `room-tab-people|history|settings`, `people-tab`, `member-row` (`data-member`, `data-role`), `member-role`, `member-pause`, `member-mute-mic`, `member-remove`, `member-allow`, `removed-row`, `room-freeze`, `room-mute-all`, `history-open`, `history-tab`, `version-label`, `version-save`, `version-row` (`data-label`), `version-preview`, `version-preview-body`, `version-restore`, `version-restore-confirm`, `settings-tab`, `room-name`, `room-rename`, `room-lock-mentors`, `lowbw-toggle`, `lowbw-toggle-entry`, `lowbw-note`, `room-delete`, `room-delete-dialog`, `room-delete-confirm`, `room-gate` (`data-status`), `room-gate-leave`, `my-role`, `auth-open`, `auth-dialog`, `auth-mode-register`, `auth-username`, `auth-display-name`, `auth-password`, `auth-submit`, `auth-error`, `profile-open`, `profile-dialog`, `profile-name`, `profile-save`, `profile-signout`, `room-list`, `room-open-row`, `role-viewer`. Dev-only: `window.__sv.files` (list, activeId, activeLanguage, readOnly, create, rename, remove, select).
Tabs have role `tab` and the names Video, AI, Quality, Debug, Progress. Dev-only: `window.__sv.editor` exposes the EditorHandle.

## Running it

```
npm run dev            # in one terminal
npm run e2e:golden     # prints PASS / SKIP / FAIL per demo step
npm run e2e:golden -- --strict   # demo morning: SKIP counts as a failure
```
