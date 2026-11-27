# Progress

## Current: Phase 1 gate passed; waiting for approval to start Phase 2

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
- Not reported: whether the paw icon is easy to see in Owlbear.

### Next: Phase 2 (Persistence), after the gate
