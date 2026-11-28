# Progress

## Current: Phase 4 built (v0.4.6, incl. Combat tab sections, feature upgrades, combat-only resources start empty); Owlbear gate test in progress

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

### Phase 2 gate, passed 2026-11-27
- In Owlbear (Chrome): test character autosaved, saved to file, survived closing/reopening the panel and a page reload.
- After deleting owlbear.rodeo site data in Chrome: welcome screen and empty list (data really cleared); loading the file showed "Restored exactly", fingerprint 823cf2b2.
- In a second, fresh Chrome profile joining the same room: loading the file showed "Restored exactly", fingerprint 823cf2b2.
- Part A fingerprint not recorded by the user; "Restored exactly" compares against the file checksum written in Part A, so B and C match it.


### Phase 3, in progress (2026-11-27)
Done and committed (127 tests passing):
- Content schema (src/data/schema.ts), extraction guide (docs/EXTRACTION.md), validation test (tests/content.test.ts).
- Data extracted by subagents and independently reviewed against page images (no errors found; review fixes applied): ancestries, backgrounds, conditions, armor/shields/weapons/gear, Radiant/Necrotic/Fire spells (+utility), Lifebinding Spirit, The Cheat and Shepherd levels 1-3 with all subclasses at level 3. Core rules values in core/rules.json.
- Rules engine: formula language (rules/formula.ts), dice engine per Core p.9/p.14 (rules/dice.ts), derivation (rules/derive.ts; quick builds Stabs! and Grace match printed numbers at L1-2), play rules (rules/play.ts: damage/Wounds/Dying, healing, Hit Dice, Field/Safe Rest, combat turns, costs, Rushed Attacks), creation and level-up rules (rules/build.ts).
- Save format v2 with v1 migration + fixtures; undo (last 50 per session) in the library.
- Platform: crypto RNG (platform/random.ts), roll broadcast sendRoll/onRoll on channel com.krunklewitz.nimble-bear/roll (platform/owlbear.ts).
- Roll service (app/rolls.ts) with tests.
- UI: creation wizard (8 steps in rulebook order, resumable draft, legal choices only, live preview), real sheet (vitals, damage/heal/temp HP, Wounds, resources, combat bar, rests, conditions, situation toggles; tabs Play/Actions/Spells/Features/Gear/Log/More; overrides; Deflect note for shields), roll window (advantage, bonuses auto/toggle/by hand, Rushed Attacks, costs with warnings, privacy, change Primary Die), roll log incl. other players's rolls, level-up wizard (snapshot first, roll with advantage or average, skill point and move, choices, save prompt after), undo last level.
- docs/AUTOMATION.md generated by scripts/automation-report.mjs (64 features with manual parts).

### Phase 3 rework after first gate test (2026-11-27, v0.3.1)
- User feedback: HP buttons unusable (they stayed disabled until an amount was typed), wanted a new layout, a full re-check of the rules, and rules text on every item.
- Second independent check: class/spell/condition data had no rule errors (2 page citations fixed). Engine audit found 7 errors, all fixed with tests: Elf Initiative advantage applied twice; 1/turn abilities usable again on others' turns (Core p.13); harmful spells/abilities count as attacks for Rushed Attacks; off-turn attacks don't count toward Rushed; Dying caps actions at once; Unarmed Strike always available, crits only with proficiency; gold/potion slots. Added: reactions (1/round, Defend +1 action in non-proficient armor), start-my-turn, ranged-adjacent toggle, no invented d20 level-up average. New rules questions RQ-015 to RQ-019.
- Equipment rules: 39 verbatim entries (core/equipment-rules.json); every item shows its facts, warnings and book rules (rules/items.ts).
- New layout (user choices): compact sticky bar (HP with −1/+1 and a tap-to-open HP panel, Wounds, Defense, actions, resources, save pill, undo), 4 tabs Combat / Character / Gear / More, compact expandable rows.

### Phase 3 gate (needs the user)
In Owlbear (Chrome): create The Cheat and a Shepherd, roll attacks/checks/saves/Initiative (also seen by a second browser), take damage, rest, level up to 3, reload.

Open rules questions added: RQ-007 to RQ-014 (docs/RULES_QUESTIONS.md).

### Phase 4 (2026-11-28)
Done: schema for pools/pool swaps/school choice/grantOptions/boons; engine (pool picks, swaps, granted options hidden from picks, Coven tiered-only, class spell lists, maxMana, +5 stat cap, levelChoices follows picks); data via subagents: Cheat and Shepherd 4-20, Hexbinder and Zephyr full, Ice/Lightning/Wind + Hexbinder spells, Boons (GMG p.75). All 4 classes x 17 subclasses build to level 20 (tests/rules/fullbuild.test.ts); docs/COVERAGE.md and AUTOMATION.md regenerated. Reviews: Hexbinder (1 error fixed: Pestilential Reign grants Pestilent), Cheat/Shepherd 4-20 (0 errors; Supreme Underdog keeps stats, RQ-022). New RQ-020..025.
Zephyr/spells/Boons review: no transcription errors; fixed behaviour: Bursts of Speed can exceed DEX (uncapped resources), Iron Defense (2) and Unyielding Resolve supersede earlier levels, Way of Pain keeps Momentum on damage (resourceChange effect), Sniper partial, Traveling Robes & Sandals added. New RQ-026..029.

### Phase 4 gate (needs the user)
In Owlbear: create a Hexbinder and a Zephyr, level them (incl. pool picks, Coven school, Epic Boon at 19 if testing high levels), cast Hexbinder spells, use Momentum/Bursts; confirm The Cheat and Shepherd still work.

## Deferred until stable
- Update check: drop the 5-minute repeat in src/ui/UpdateBanner.tsx (CHECK_EVERY_MS) and check only when the panel opens. User decision 2026-11-27; do it in Phase 6 polish or when the user calls a version stable.
