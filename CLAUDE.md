# Nimble Bear (Owlbear Rodeo extension for Nimble 2)

Read first: `nimble-sheet-prompt.md` (requirements, decides what gets built), `docs/PROGRESS.md` (where we are), `docs/DESIGN.md` (approved design).

## Hard rules
- Rules and game data come only from PDFs in `reference/`, with a source note (file, version, PDF page, printed page). Never from memory. Unclear → `docs/RULES_QUESTIONS.md`, mark `unverified`, ask.
- `reference/` and `private/` are git-ignored. Never commit, upload or deploy them. No monster data in the public build.
- Read PDFs in page ranges (`pdftotext -f N -l N -layout`). Pages are 2-page spreads: PDF n = printed 2n−2/2n−1 (Monsters & More: 2n−6/2n−5). Spot-check tables against `pdftoppm` images.
- Persistence is the top priority: every change autosaves; the character file is the durable copy; never overwrite newer data without asking; snapshots before load/level-up/migration.
- Layers: `rules/` pure TS (no React/SDK/storage); `platform/` is the only code touching Owlbear, files or storage (with mocks); `app/` is glue with no React (character library); `ui/` has no rules logic. ESLint enforces these.
- Save format changes: bump CURRENT_SCHEMA_VERSION, add MIGRATIONS[n], keep old fixtures in tests/fixtures/saves/vN/ forever, regenerate the new one with UPDATE_FIXTURES=1.
- Check Owlbear SDK APIs against https://docs.owlbear.rodeo/extensions/ before use (WebFetch gets 403; use the browser).
- One phase at a time. Gate: typecheck, lint, tests, build, commit, manual test steps, then stop for approval. Don't weaken tests.

## Scope decisions (see DESIGN.md §11)
- Classes: only The Cheat, Hexbinder, Shepherd, Zephyr (more later via data). No homebrew, no multiclassing.
- Desktop Chrome only. No mobile work. GitHub Pages hosting.

## Deploying
- Bump package.json version for every user-visible deploy: the app compares it with the live manifest.json and shows an Update banner. GitHub Pages caches index.html for 10 minutes (max-age=600), so without a version bump users can keep seeing an old build.

## Environment (Windows)
- Git, Node LTS, Poppler and qpdf are installed via winget. Refresh PATH in new shells: `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`.
- qpdf isn't on PATH: `& "C:\Program Files\qpdf 12.4.2\bin\qpdf.exe"`.
