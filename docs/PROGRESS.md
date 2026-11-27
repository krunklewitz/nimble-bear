# Progress

## Current: Phase 0 done; ready for Phase 1

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

### Still needed from the user
- Which optional rules the table uses (DESIGN.md §11). Needed by Phase 3.

### Next: Phase 1
Skeleton, license notice screen, manifest, GitHub Pages deploy, iframe capability spike (download / file picker / IndexedDB / clipboard in desktop Chrome).
