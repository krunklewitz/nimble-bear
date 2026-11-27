# Progress

## Current: Phase 2 (Persistence) built; waiting for the restore proof

### Phase 0 (Plan), done 2026-11-26
- Setup check: Windows 11 Home. Installed Git 2.56.1, Node 26.13.1 LTS / npm 11.20.0, Poppler 26.09.0, qpdf 12.4.2 (winget). Target browser: desktop Chrome 158.
- Moved the 7 rulebook PDFs into `reference/`; `.gitignore` excludes `reference/` and `private/`.
- PDF reading confirmed, incl. the weapon table on Core p.35 checked against the rendered image.
- Read: Core Rules mechanics, the four class files, GMG encounter guidelines and boons, Monsters & More structure, Owlbear extension docs, Nimble 3rd Party Creator License v2.0.
- Wrote `docs/DESIGN.md`, `docs/SOURCE_INDEX.md`, `docs/RULES_QUESTIONS.md`, `CLAUDE.md`.
- Brief Ember Vault review (cloned to a temp folder outside the project; no code reused).
- Design approved with decisions (DESIGN.md §11): name **Nimble Bear**; classes Cheat/Hexbinder/Shepherd/Zephyr only; Phase 3 = Cheat + Shepherd; no homebrew, no multiclassing; desktop Chrome only; GitHub Pages; build on the 3.2/3.0/3.1 files.

### Accounts and repo (2026-11-26)
- Git identity: krunklewitz / GitHub noreply email (private email blocked on push).
- Repository: https://github.com/krunklewitz/nimble-bear (public), `main` pushed; Git Credential Manager signed in.
- Owlbear Rodeo account: user has one.
- Extension URL will be https://krunklewitz.github.io/nimble-bear/ (Pages set up in Phase 1).

- Optional rules: only **Deflect!** (Core p.33). No other optional rules.

### Phase 1, built 2026-11-26
- Vite 8 + React 19 + TypeScript 6 (strict) + Zod 4 + Vitest 5 + ESLint 10. Extra dev deps: jsdom, @testing-library/react (UI tests), globals.
- `manifest.config.ts` builds the Owlbear manifest with absolute URLs (dev: localhost:5173, prod: krunklewitz.github.io/nimble-bear/). Served in dev, written to dist/ on build.
- `src/platform/`: Owlbear implementation + mock (normal tab) + storage capability checks. ESLint blocks React/SDK/storage in `src/rules/` and the SDK in `src/ui/`.
- UI: welcome screen with the exact license notice, About page (notice, attribution, unofficial statement, SRD 5.1 notice), placeholder home, Storage check screen.
- GitHub Actions: typecheck, lint, test, build, no-PDF guard, deploy to Pages.
- npm audit: 2 moderate (uuid inside @owlbear-rodeo/sdk; advisory only affects v3/v5/v6 with a caller-supplied buffer). No fix available upstream.

### Phase 1 gate, passed 2026-11-27
- Deployed by GitHub Actions to https://krunklewitz.github.io/nimble-bear/ (manifest served with CORS *).
- Installed in Owlbear and opened in a real room in desktop Chrome 158.
- Storage check inside Owlbear: download, file picker, IndexedDB (incl. surviving popover close/reopen), persistent storage, clipboard read/write and pop-out all work. Save dialog (showSaveFilePicker) is blocked in cross-origin iframes. Details: DESIGN.md §5.4.
- Paw icon confirmed easy to see in Owlbear.

### Phase 2, built 2026-11-27 (v0.2.0)
- Character format v1 (Zod, strict): choices + play state only. File envelope nimble-bear/character with SHA-256 checksum of canonical JSON; names like Name_L1_2026-11-27.nimble.json.
- Load rules: new or same load directly; a newer file replaces only when nothing local is unsaved (snapshot first); anything else shows both copies (keep local / use file / keep both). Invalid files change nothing. After loading, the stored copy is read back and compared to the file checksum (shown as "Restored exactly").
- IndexedDB store (characters, snapshots, settings) with in-memory fallback; autosave on every change; snapshots before load, restore, delete and stored-data migration (20 per character kept, migration ones kept forever); deleted characters recoverable.
- Screens: character list, test sheet (stand-in fields), load review / compare, snapshots, End session; badge on the Owlbear icon while unsaved.
- Migrations framework + v1 fixture (tests/fixtures/saves/v1/). New dev dep: fake-indexeddb (tests run the real IndexedDB code).
- Deferred to Phase 3: per-change undo stack (comes with rules events), level-up save prompt and snapshots (level-up doesn't exist yet).

### Phase 2 gate (needs the user)
- In Owlbear: create a test character, change values, save file, close and reopen (still there).
- Clear site data, reopen (list empty), load the file: expect "Restored exactly" and the same fingerprint.
- In a second Chrome profile: install the extension, load the file: expect "Restored exactly" and the same fingerprint.

### Next: Phase 3 (dice, rules core, The Cheat + Shepherd to level 3), after the gate
