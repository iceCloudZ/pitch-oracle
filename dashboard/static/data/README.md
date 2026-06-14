# dashboard/static/data

This directory holds the JSON the prerendered dashboard reads from `/data/...`.
It is **populated at build time** by `scripts/sync-data.mjs`, which copies
`<repo>/data/**/*.json` here (mirroring structure) before `vite build`.

The synced JSON files themselves are gitignored (they are generated artifacts
that live in the repo-root `data/` dir or the `data` git branch). This README
and a `.gitkeep` are the only committed entries.

If `data/` at the repo root is empty or missing, `sync-data.mjs` simply emits
an empty directory and the dashboard renders a friendly empty state.
