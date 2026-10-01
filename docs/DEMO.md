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
| 2b | 0:45 | Asha, Ravi | Optional, 20 s: Asha opens the **Whiteboard** tool and sketches a linked list (rectangles and arrows); Ravi sees it appear live and adds a label. In a Java file, Ravi types `sout`, presses **Tab**, and gets `System.out.println();` like in VS Code | whiteboard, editor completion |
| 3 | 1:00 | Video | Join call in the **Together** tool; wave, share the screen for two seconds | video dock (needs keys + two devices) |
| 4 | 1:30 | Ravi, Mei | Samples menu, **"Stdin Average"**. Ravi runs with `3 4 5`, Mei runs with `10 20`. Different output, each only sees their own | run pipeline, private consoles |
| 5 | 2:15 | Ravi | Samples menu, **"Index Error"**. Run. The line is marked. **Understand** tool, **Explain with AI**. Show patch: Reject (nothing changes), show again, Accept (both editors update) | error line, AI explain, patch |
| 5b | 3:15 | Ravi | Optional, 30 s: on a fresh failure press **Guide me with hints** instead of Explain. Rung 1 is a nudge, **Need another hint?** shows the guiding question ("what is the biggest value `i` takes?"), **Still stuck? Show the fix** opens the explanation and the patch button. Say: the ladder is optional, Explain with AI still gives the answer straight away | hint ladder |
| 5c | 3:25 | Ravi | Optional, 30 s: press **Debug** next to Run. The stepper opens in the **Debug** tool: press **Step**, or click line 4's number to run to that line again and again, and watch `i` go 0, 1, 2, 3 with its history chips, `total` change, and the program stop on the IndexError. Works on correct code too | step-through debugger |
| 6 | 3:30 | Mei | Samples menu, **"Quality Sample"**. **Code quality** lists findings in five categories | quality panel |
| 7 | 4:00 | Asha, Ravi | In the **Debug** tool Asha requests access to Ravi's session. Ravi allows (with "assist" if Asha should re-run the code and suggest an edit, which Ravi accepts or rejects). Asha sees Ravi's console. Ravi revokes; it disappears instantly. The mentor then follows Ravi's step-through live (Ravi presses **Debug** and steps; the mentor's view moves with him), and gets a notice for every change. | debug access |
| 7b | 4:30 | Asha, Ravi | Optional, 60 s: Asha opens the **Quiz** tool, answers five short choices (Arrays and Strings, Mixed, Both, 4 questions, 5 minutes) and starts it. Ravi's top bar shows **Quiz live**; he answers one multiple-choice question and submits a coding problem. The **live board** (share it on screen) moves; Asha ends the quiz and the **podium** appears | quiz arena |
| 8 | 4:45 | Ravi | **Your progress**: "retry recommended" observation, no scores | progress page |
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
| Run does nothing / Judge0 error | Set `RUNNER=local` in `.env` and restart: the demo runner (Python and JavaScript) takes over; say "demo runner, not the sandbox" |
| AI slow or down | The planted programs have pre-baked explanations (`shared/samples.ts`); Lane C serves them from cache |
| Video will not connect | Use a normal video call in another window and say so |
| Wi-Fi drops | Phone hotspot; everyone reconnects; edits made offline merge when back |
| A panel shows "This panel hit an error" | Only that panel is affected. Click Reload panel, or carry on without it |

## Say this if asked

- Accounts are optional: a guest is a name and a room code; a signed-in person keeps their name and finds their rooms. State lives on the server laptop (rooms and accounts are saved under `server/data/`) and resets if that folder is deleted.
- Privacy is enforced in the API: a run or explanation is readable only by its owner or someone they allowed.
- AI explanations can be wrong; the student always decides whether a patch is applied.
- It runs locally, not deployed. Roadmap: a real database and accounts, more languages, the execution canvas, predict-and-reflect, classrooms.

