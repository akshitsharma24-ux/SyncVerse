# frontend-old: the previous SyncVerse frontend (backup)

This is the light/dark "paper and ink" frontend that `web/` used to be, kept as a safety net. It is **not** part of the npm
workspaces and nothing imports it. The default frontend is now `web/` (the dark "Quiet Studio" design).

It still has everything the app had when it was replaced, including the whiteboard and the Tab snippets.

```
npm run dev:old        # API on :4000 and this frontend on http://localhost:5175
npm run typecheck:old
npm run build:old
```

Dependencies come from the root `node_modules` (the same packages `web/` uses), so no separate install is needed.
To go back to it for good: move this folder to `web/` (and the current `web/` somewhere else) and run `npm run dev`.
