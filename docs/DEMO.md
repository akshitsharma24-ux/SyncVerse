# Demo script and demo-morning checklist

About 5 minutes. Edit the names to whoever actually does what. Every step says which tool makes it work, so you can see at a glance
what to cut if a lane is not ready (see the cut ladder in the overnight plan PDF).

## Who does what (suggested)

| Role | Person | Device |
|---|---|---|
| Presenter / narrator | Miti | none (talks) |
| Mentor "Asha" | Miti's second tab, or Rahil | laptop 2 |
| Student "Ravi" | Akshit | laptop 1 (also runs the server) |
| Student "Mei" | Simrit | laptop 3 or phone |
| Driver / fallback (restarts, video, cache) | Rahil | any |

Use a separate device for each person who turns on a camera (two tabs on one laptop fight over one webcam).

## Demo-morning checklist

Do this in order. Stop and fix anything red.

1. Everyone: `git pull`, `npm install`. One laptop runs the server: `npm run dev`.
2. On the server laptop: `npm run preflight -- --strict`. Every line must be `[ OK ]`. Read any `[FAIL]` or `[WARN]` aloud and fix it.
3. `npm run verify:samples` (all PASS) proves the demo programs still behave.
4. `npm run e2e:golden -- --strict` plays the whole demo with three browsers. **Every step must PASS** (no SKIP, no FAIL).
5. Other devices open `http://<server laptop address>:5173` (the address printed by Vite as "Network"; phone hotspot is fine).
6. Warm everything up once: run a program, click Explain with AI, open the video call, then reset (step "Reset" below).
7. Record the backup video of the golden path with audio. Keep it on a USB stick.
8. Freeze: no code changes after this point.

## The script

| # | Time | Who | What happens | Needs |
|---|---|---|---|---|
| 1 | 0:00 | Presenter | "Learn to code together, understand it on your own." Mentor creates a room; two students join with the code or the invite link | entry page |
| 2 | 0:30 | All | Everyone edits one file; point at the labelled cursors and the presence avatars | editor, presence |
| 3 | 1:00 | Video | Join call in the Video tab; wave, share the screen for two seconds | video dock (needs keys + two devices) |
| 4 | 1:30 | Ravi, Mei | Samples menu, **"Stdin Average"**. Ravi runs with `3 4 5`, Mei runs with `10 20`. Different output, each only sees their own | run pipeline, private consoles |
| 5 | 2:15 | Ravi | Samples menu, **"Index Error"**. Run. The line is marked. **Explain with AI**. Show patch: Reject (nothing changes), show again, Accept (both editors update) | error line, AI explain, patch |
| 6 | 3:30 | Mei | Samples menu, **"Quality Sample"**. Quality tab lists findings in five categories | quality panel |
| 7 | 4:00 | Asha, Ravi | Asha requests access to Ravi's session. Ravi allows. Asha sees Ravi's console. Ravi revokes; it disappears instantly | debug access |
| 8 | 4:45 | Ravi | Progress tab: "retry recommended" observation, no scores | progress page |
| 9 | 5:15 | Presenter | Roadmap: execution canvas, predict-and-reflect checkpoints, classrooms. **Say plainly these are not built yet** | - |

If a step's lane is not ready, skip it out loud ("this panel is next") rather than showing a placeholder.

## Reset between runs

- New room: just create another room (new code). Old rooms are kept on disk in `server/data/rooms/`.
- Clean slate: stop the server, delete the folder `server/data/rooms/`, start it again.
- Everyone's session is per browser tab; closing the tab forgets the person.

## When something breaks

| Symptom | Do this |
|---|---|
| Top bar chip says "Server offline" | The API died. Re-run `npm run dev` on the server laptop; rooms and code come back from disk |
| "to set up" chip | Click it: it lists which key is missing. Add it to `.env`, restart the server |
| Run does nothing / Judge0 error | Use the local fallback runner if Lane B built it, and say "demo runner, not the sandbox" |
| AI slow or down | The planted programs have pre-baked explanations (`shared/samples.ts`); Lane C serves them from cache |
| Video will not connect | Use a normal video call in another window and say so |
| Wi-Fi drops | Phone hotspot; everyone reconnects; edits made offline merge when back |
| A panel shows "This panel hit an error" | Only that panel is affected. Click Reload panel, or carry on without it |

## Say this if asked

- No accounts yet: a person is a name and a room code. State lives on the server laptop and resets if its data folder is deleted.
- Privacy is enforced in the API: a run or explanation is readable only by its owner or someone they allowed.
- AI explanations can be wrong; the student always decides whether a patch is applied.
- It runs locally, not deployed. Roadmap: a real database and accounts, more languages, the execution canvas, predict-and-reflect, classrooms.

