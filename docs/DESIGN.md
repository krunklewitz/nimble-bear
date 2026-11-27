# Nimble Bear: design and phase plan (Phase 0)

Status: **approved 2026-11-26** with the decisions in §11. No application code exists yet.

## 1. What we're building

One Owlbear Rodeo extension, served as a static site, with two views over shared data and rules:

- **Player view** (action popover, about 400×600): guided creation, play sheet with roll buttons and trackers, guided level-up, save/load character file.
- **GM view** (same popover, when `OBR.player.getRole()` is `"GM"`; later phases): encounter builder, combat tracker linked to tokens, party view, monster reveals.

The site also runs in a normal browser tab with mocked Owlbear APIs. That's for development, and it's the fallback "pop-out" if file features fail inside Owlbear's iframe.

## 2. Platform facts (from docs.owlbear.rodeo, read 26 Nov 2026)

| Topic | What the docs say | Design consequence |
|---|---|---|
| Manifest | `name` (≤45 chars), `version`, `manifest_version: 1`, `description` (≤128), `icon`, `author`, `homepage_url`, `action {title, icon, popover, width, height}`, `background_url`, `permissions[]` | Popover 400×600. One manifest. |
| Iframe permissions | Manifest can request only `clipboard-write`, `clipboard-read`, `autoplay`, `bluetooth`, `camera`, `microphone`, `usb`, `display-capture`, `hid` | **Nothing about downloads, file pickers or storage.** Must test empirically (Phase 1 spike). Request `clipboard-write`/`clipboard-read` for the copy/paste fallback. |
| CORS | Vite dev server needs `server.cors.origin = "https://www.owlbear.rodeo"` | Set in Phase 1. Check that GitHub Pages' headers let Owlbear fetch the manifest (expected, not yet verified). |
| Action | `OBR.action` open/close/isOpen/`onOpenChange`, width/height, badge text | Popover can close at any time. **Every change is persisted immediately**; nothing relies on close events. Badge can show "unsaved". |
| Broadcast | `OBR.broadcast.sendMessage(channel, data, {destination: REMOTE/LOCAL/ALL})`, **16 KB** limit, ephemeral | Rolls broadcast as compact JSON with a full breakdown (far under 16 KB). Private rolls: `LOCAL` only, or GM-only through a channel the GM view filters (see §6). |
| Metadata | Room metadata total **< 16 kB**, shared by all extensions; item/player/scene metadata exist; namespace keys (`com.example/…`) | Never store sheets in metadata. Player metadata: tiny summary (name, HP/Wounds) for the party view. Token metadata: character ID link + small summary only. |
| Player / party | `OBR.player.id` (stable per user), `getRole()`, `getConnectionId()`; `OBR.party.getPlayers()`/`onChange` | GM party view reads player-metadata summaries. Role decides the view. |
| Scene items | `OBR.scene.items` get/update/add/delete, `OBR.scene.local` for local-only items; scene may not be open (`isReady`) | Combat tracker (Phase 5) must work with and without an open scene. |
| Popover / modal | `OBR.popover.open({id,url,width,height,…})`, `OBR.modal.open({…, fullScreen})` | Creation wizard can use a larger modal if 400×600 is too tight. |
| Notification | `OBR.notification.show(msg, variant)` | Save reminders, roll toasts. |
| Verification guidelines (for reference) | Works in Chrome, Firefox, Safari, mobile, private windows, with and without a scene | Reference only: we target desktop Chrome, so we will not meet the store's cross-browser and mobile verification bar. |

Not in the docs, so it must be tested (Phase 1 spike): file download (`<a download>`), `<input type=file>`, the File System Access API, IndexedDB persistence, `navigator.storage.persist()`, and clipboard inside the iframe in desktop Chrome. Background-page lifetime is also undocumented.

**Storage partitioning (browser behavior, to verify in the spike):** modern browsers key third-party iframe storage by the top-level site. So the sheet's IndexedDB inside Owlbear is **separate** from the same site opened in its own tab. Clearing site data or switching computers also loses it. That is why the **character file is the durable copy**, and the pop-out fallback moves characters by file or paste, never by shared storage.

## 3. Architecture

```
src/
  data/       content JSON + Zod schemas (classes, ancestries, backgrounds, items, spells, conditions, boons)
  rules/      pure TS: formulas, dice, derivation, actions, resources, rests, leveling, migrations, encounters
  platform/   the only code touching Owlbear, files, IndexedDB, clipboard; each with a mock
  ui/         React components; call rules/ and platform/ through small hooks; no rules logic
tests/
  fixtures/saves/v1/…   every save-format version, kept forever
  fixtures/builds/…     quick-build heroes from the class PDFs, with expected derived numbers
```

- **Store choices and play state; derive everything else.** `derive(content, character) → Sheet` is a pure function. Max HP, Defense, skills, saves, mana max, actions available and roll expressions are never stored, only overridden.
- **Stable IDs** everywhere (`class.cheat`, `feature.cheat.sneak-attack`, `opt.cheat.underhanded.misdirection`). Saves reference IDs, never display names.
- **Content is versioned.** Each entry carries `source: { file, version, pdfPage, printedPage }`. Saves record which content versions they were built with, so a later rules update can show what changed.
- **Undo:** every play-state change is an event (`{type, before, after, at}`) on a bounded undo stack (in IndexedDB, not the file). Level-ups are undoable as a unit.
- **Overrides:** any derived value can be overridden (`overrides["defense"] = 7`). The sheet shows overridden values with a marker and a reset button.
- **Dependencies beyond the required stack:** `idb` (tiny IndexedDB promise wrapper, ~1 kB; optional, could hand-roll). Nothing else planned. No dice library (own roller); no state library (React context + reducer is enough).

## 4. Content schema and effect vocabulary

### 4.1 Content entities (Zod-validated JSON)

```ts
Source      { id: "cheat@3.0", file: "TheCheat3.0.pdf", version: "3.0" }
SourceRef   { source: "cheat@3.0", pdfPage: 3, printedPage: 5, status: "verified" | "unverified" }

ClassDef {
  id, name, keyStats: [Stat, Stat], secondaryStats: [Stat, Stat],
  hitDie: Die, startingHp: number, saves: { adv: Stat, dis: Stat },
  armor: ArmorCategory[], weapons: WeaponRule[], startingGear: ItemRef[],
  vars: Record<string, VarValue>,          // class-scaled numbers/dice, e.g. sneakAttackDice: "1d6"
  levels: Record<1..20, FeatureId[]>,
  subclassLevels: number[],                 // [3, 7, 11, 15]
  optionPools: Record<PoolId, OptionId[]>,  // Underhanded Abilities, Afflictions, Mystic Marks, Sacred Graces…
  retrain?: { trigger: "safeRest", text }   // "Trade Secrets", "Bubble, Bubble!", "Serve", "Focus"
  source: SourceRef
}
SubclassDef { id, classId, name, levels: Record<number, FeatureId[]>, source }
FeatureDef  { id, name, text, effects: Effect[], automation: "full" | "partial" | "manual", source }
AncestryDef { id, name, size: Size | Size[], effects, source }    // size choice for "Small or Med"
BackgroundDef { id, name, requires?: Predicate, effects, source } // "Req. 0 or negative INT at creation"
ItemDef     { id, kind: weapon|armor|shield|gear|consumable|wand|scroll, slots, cost, …kind fields, source }
SpellDef    { id, name, school | list, tier (0 = cantrip), actions, reach?, range?, aoe?, roll?, text, upcast?, source }
ConditionDef, BoonDef (minor/major/epic), each with effects where automatable
```

### 4.2 Formulas

A small, safe expression language, parsed by our own parser (no `eval`):
`LVL`, `KEY`, `STR`/`DEX`/`INT`/`WIL`, numbers, `+ − ×`, `min/max/floor/half`, `var.<name>`, and dice terms (`1d6`, `WIL d20` = WIL × d20, `1d8+STR`). Dice can be stepped (`d6 » d8`).

### 4.3 Effects (discriminated union)

| Effect | Shape (abridged) | Examples |
|---|---|---|
| `modifier` | `{ target: StatPath, op: add\|set\|min\|max\|stepDie, value: Formula, when?: Predicate }` | Human +1 skills and Initiative; Dwarf +2 max HD, +1 Wounds, −1 Speed; Zephyr Iron Defense `set defense = DEX+STR when self.unarmored` |
| `setVar` | `{ var, value }` (later levels overwrite) | Sneak Attack 1d6 → 1d8 → 2d8 …; Galeforce Strike 1d12 → 1d20; Futuresight Dice count/Reach |
| `save` | `{ stat \| "choice", set: adv\|dis\|neutral }` | Fiendkin: 1 neutral save → advantaged (choice); Celestial: ▼ → neutral |
| `grant` | `{ action: ActionDef }`: name, kind (attack/spell/ability/reaction/free/passive), cost `{actions, mana?, resource?}`, roll?, reach/range, limit `{n, per: turn\|round\|encounter\|safeRest}`, text | Hex (Reach 4, 1d4, on hit +LVL or Affliction); Lifebinding Spirit Harm/Mend; "How'd YOU get here?!" (2 actions) |
| `resource` | `{ id, max: Formula, start?, recover: [{on: Trigger, amount}], lose?: Trigger[], dice?: {die, rolled: "gained"\|"spent"} }` | Mana (`WIL+LVL`, safe rest); Mend charges (`WIL`/safe rest); Momentum (manual gain, lost on damage/combat end); Bursts of Speed (`DEX` on Initiative, lost at combat end); Futuresight Die (1d4, rolled when gained at combat start) |
| `choice` | `{ id, count, from: pool \| options \| {spell filter} \| {stat options} \| subclass \| epicBoon \| skillPoint, unique, retrain?: safeRest }` | Underhanded Ability (2nd, 3rd…); "+1 DEX or INT"; Master of Twilight utility spells; Coven school; Familiar Boon |
| `spells` | `{ access: {schools[]\|list}, maxTier: n, cantrips?, extra?: SpellId[] }`, plus `replaceSchool` | Shepherd tiers 1→9 by level; Hexbinder list; Forge "exchange Necrotic for Fire" |
| `rollOption` | `{ on: attack\|damage\|save\|check\|initiative\|anyDie, change: advantage\|disadvantage\|addDice\|floor\|setPrimary\|critRange\|missRange\|reroll\|stepDie, when?: Predicate, cost?: resource/limit, mode: auto\|toggle }` | Cheat initiative floor 10 (auto); Vicious Opportunist "set Primary Die" (toggle: target Distracted); Sundered crit on max−1; Worthy Underdog miss on ≤2 (toggle: Upper Hand); Gambler reroll any die (1/encounter) |
| `replace` | `{ features: FeatureId[], with?: FeatureId[] }` | Honorseeker gives up Sneak Attack, Vicious Opportunist, Underhanded, Twist the Blade; Professional Skulker replaces Leave No Trace |
| `proficiency` | `{ armor\|weapons\|languages\|unarmedCrit }` | Thieves' Cant; Zephyr unarmed strikes |
| `hook` | `{ on: Trigger, do: Effect \| HandlerName }` | Reactive Force: on gaining a Wound, +1 Burst; Unyielding Resolve: ignore first N Wounds per encounter; Siphon Essence: +10 temp HP when applying an Affliction |
| `handler` | `{ name }`: named code for the few things data can't express | Gambler "All In"; Terror (roll with advantage per Affliction, × LVL); Creative Accounting (borrow actions from next turn) |
| `text` | nothing automated: shown with manual controls | Sweet Talk; Harbinger of Decay; Consult the BONES |

**Predicates** split in two:
- **Self-state:** `self.unarmored`, `self.dying`, `self.bloodied`, `self.fullHp`, `resource.momentum ≥ n`. Evaluated automatically.
- **Situation:** target Distracted, enemy has The Upper Hand, target Afflicted, target Poisoned. The sheet can't see the board, so these are **toggles in the roll dialog**, never guessed.

**Triggers:** `safeRest`, `fieldRest`, `initiative`, `combatEnd`, `turnStart`, `turnEnd`, `roundEnd`, `damageTaken`, `woundGained`, `healedToMax`, `levelUp`, `manual`.

### 4.4 Paper test against three very different classes

I modeled every level 1–5 feature of three classes, plus their hardest later features, against this vocabulary. Nothing needed a new effect type; a few need named handlers, as listed below.

**The Cheat (martial, dice manipulation, a subclass that rewrites the class)**

| Feature | Model | Automation |
|---|---|---|
| Sneak Attack (1/turn, crit: +`var.sneakAttack`) | `setVar` per level + `rollOption{on: damage, change: addDice var.sneakAttack, when: crit, limit 1/turn}` | full (limit tracked per turn) |
| Vicious Opportunist | `rollOption{change: setPrimary, when: toggle "Distracted & hit", limit 1/turn}` | partial: dialog lets the player pick the face after rolling |
| Cheat (L2) | 4 effects: free Move/Hide 1/round (`grant` free); skill check → 10+INT 1/safe rest (`rollOption floor`, resource); Initiative floor 10 (auto); gaming advantage (`text`) | full / text |
| Underhanded Ability ×8 | `choice{from: pool underhanded, retrain: safeRest}` | full |
| Misdirection | `modifier defense +INT` + `text` (halve instead of Defense, offered as a Defend option) | partial |
| Creative Accounting | `handler` (action debt carried to next turn) | full |
| Twist the Blade (L5) / 2 (L13) | `grant` action (1) → `setVar` cost 0 1/turn | partial (choose die face) |
| Honorseeker (story subclass) | `replace` 4 core features; new pool "Honorable Gambits" substitutes the Underhanded choice; Old Habits at L7 gives 1 Underhanded pick | full |
| Gambler: All In | `handler` (one die > average → maximize all Sneak Attack dice, else minimize) | full |

**Hexbinder (caster with its own spell list, effects on enemies, a dice pool)**

| Feature | Model | Automation |
|---|---|---|
| Hex | `grant` attack, Reach 4, 1d4, on hit choose "+LVL damage" or "apply Affliction" | full roll; Affliction choice recorded |
| Afflictions (know 2, then 3/4/5) | `choice{pool afflictions}`; the **affliction tracker** is play state (1 target, max INT different afflictions, ends when Concentration breaks) | manual tracker with reminder text |
| Mana `WIL+LVL`, safe rest | `resource` | full |
| Diminution (−1 mana per Humble/Slow/Weak) | cast dialog checkboxes: each lowers cost by 1, halves Range/Reach, adds 1 action or disadvantage; only offered when the spell has that property | full |
| Tier unlocks L2/4/6/8/10 | `spells{list: hexbinder, maxTier}` | full |
| Soothsayer: Futuresight Die | `resource{dice: 1d4, rolled: gained, recover on initiative, lose on combatEnd}` + `setVar` count/Reach/advantage at L10/14/17 | partial: rolls and stores the face; "spend" logs the change (it can alter anyone's die, so applying it to someone else's roll is manual) |
| Rite of Mending / Life Bloom | `grant` spell; the target spends their own Hit Dice on their own sheet | partial (the healer's side automated) |
| Coven (Mystic Mark) | `choice{school}` → `spells{access += school}` | full |
| Terror (T5) | `handler` (d6 with advantage per Affliction, × LVL) | full, with the Affliction count as input |

**Shepherd (companion, school spells, story subclass swaps a school)**

| Feature | Model | Automation |
|---|---|---|
| Keeper of Life & Death | `spells{schools: radiant, necrotic, cantrips}` | full |
| Lifebinding Spirit (Harm 1d8+STR ignores armor; Mend WIL d20 to a Dying creature, WIL/safe rest) | `grant` ×2 + `resource mend` | full |
| Shared action pool, separate creature for Rushed Attacks | turn tracker counts attacks per creature (hero, companion) | full |
| Mana `(WIL×3)+LVL` | `resource` | full |
| Master of Twilight | `choice{spell: necrotic utility}` + `choice{spell: radiant utility}`; L11: `spells{extra: all utility}` | full |
| Upgraded Cantrips (L5/10/15/20) | cantrip `SpellDef.upcast` by level, data from Core p.46–53 | full once spell data exists |
| Luminary of the Forge | `replaceSchool necrotic → fire`; Seasoned Journeyman = `choice` made at each safe rest, stored in play state | full |
| Revitalizing Blessing (L17) | `hook` on healing roll: any die ≥6 → prompt "recover 1 Wound" | partial |

Zephyr (Momentum, unarmored formulas) was checked more briefly. It needs nothing new: Momentum is a `resource` with `lose: [damageTaken, combatEnd]` and a "+1 per space" button. Iron Defense is a `modifier` with `when: self.unarmored`, and Unyielding Resolve is a `hook` on `woundGained`.

### 4.5 Hardest features (all available classes)

| Class | Hardest features | Approach |
|---|---|---|
| Core rules | Rushed Attacks (cumulative disadvantage), exploding crits, Initiative → 1/2/3 starting actions, Defend/Interpose reactions spending next turn's actions, Dying wound rules, non-stacking temp HP (choose which to keep), armor non-proficiency (+1 action to Defend), range disadvantage for +2 Range | Turn tracker in play state; roll engine handles adv/dis/explode/primary die; temp HP prompt |
| The Cheat | Vicious Opportunist / Twist the Blade (choose die faces), Creative Accounting, Honorseeker replacement, Gambler | `setPrimary` dialog step, handler, `replace` |
| Hexbinder | Afflictions on enemies, Futuresight dice that can change anyone's roll, Diminution, Life Bloom using the target's Hit Dice, d44/d66 dice | manual tracker, dice pool, cast-dialog options |
| Shepherd | Companion sharing the action pool, Mend charges, Forge school swap, upgraded cantrips | turn tracker per creature, `replaceSchool` |
| Zephyr | Momentum lost on damage, unarmored formulas, Bursts of Speed per encounter, ignoring Wounds | resource with loss triggers, predicates, hook |

The full list of anything shown as text-only goes in `docs/AUTOMATION.md` from Phase 3.

## 5. Character data and the save file

### 5.1 What's stored

```ts
Character {
  id: uuid, revision: number, createdAt, updatedAt,
  name, player?, portrait? (no images in file v1),
  content: { "core": "3.2", "cheat": "3.0", … },      // versions used
  build: {
    stats: { method: "standard"|"balanced"|"minmax"|"manual", assign: Record<Stat, n> },
    ancestry: { id, choices }, background: { id, choices }, motivation?, languages: [],
    levels: LevelRecord[]                               // 1..current, in order
  },
  play: {
    hp, tempHp, wounds, hitDiceSpent, resources: Record<id, {current, faces?}>,
    conditions: [{id, note?, until?}], turn: {inCombat, actions, rushed: Record<creature, n>, debt?},
    afflictionTarget?, inventory: [{itemId|custom, qty, equipped, notes}], gold, notes,
    restChoices: Record<featureId, optionId>             // e.g. Seasoned Journeyman
  },
  overrides: Record<StatPath, number|string>,
  settings: { optionalRules: [...], heroicSkillPoints?: n }
}
LevelRecord { level, classId, hp: {method: "roll"|"average", value}, skill: {add, move?}, choices: Record<choiceId, id[]> }
```

`classId` sits on each level record, so the official **multiclassing** variant (Core p.54) costs nothing, but multiclassing is not supported (decision §11).

### 5.2 File format

```json
{
  "format": "nimble-sheet/character",
  "schemaVersion": 1,
  "appVersion": "0.2.0",
  "savedAt": "2026-11-26T21:04:00Z",
  "checksum": "sha256:…",
  "character": { … }
}
```

- File name: `Brakka_L3_2026-11-26.nimble.json` (name sanitized).
- `checksum` covers the canonical `character` JSON. A mismatch warns ("file was edited or damaged") but still lets the player load after confirming.
- The app tracks `lastSavedRevision` and `lastSavedAt` per character, so the header shows "Saved 2 h ago · 14 changes since". Badge text on the action icon shows unsaved changes.

### 5.3 Rules

1. **Autosave:** every change is written to IndexedDB at once (debounced ~250 ms, one transaction). On open, the most recent local character loads ready to play.
2. **Load:** parse → check `format` → migrate a copy → Zod validate → compare with local:
   - Same `id`, file `revision` ≥ local and local has no unsaved changes → replace (after a snapshot).
   - Otherwise (local newer, or both changed since the last common save) → **side-by-side comparison** (name, level, HP, last saved, revision) with "Keep local", "Use file", "Keep both (as copy)".
   - Any failure → nothing is written; the original file is never touched (the app can't write to files anyway).
3. **Snapshots** (IndexedDB) before every load, level-up, level undo and migration. Keep the last 20 per character plus every pre-migration snapshot. A Restore screen lists them.
4. **Prompts:** after a level-up ("Save your character file now?") and from an **End session** button (shows the save step, then marks the session ended). Nothing depends on close/unload warnings.
5. **Migrations:** `migrations[n]: (vN) → vN+1`, pure and tested. `tests/fixtures/saves/vN/*.json` is kept forever; CI loads every fixture through the whole chain, then validates and derives.
6. **Room/token metadata:** only `{ characterId, name, hp, hpMax, wounds, woundsMax }`-sized summaries; never the sheet.
7. **GM collection (Phase 5–6):** players can send a party summary over broadcast (≤16 KB, well within for a summary), or the full file by download → GM loads it. The GM's campaign file (encounters, monsters, reveals) is a separate format, `nimble-sheet/campaign`, saved and loaded the same way.

### 5.4 Fallbacks if the iframe blocks files (decided by the Phase 1 spike)

| Blocked | Fallback (no server) |
|---|---|
| Download | "Copy character file" to the clipboard (manifest `clipboard-write`) + "Open in pop-out window" (our site as a top-level tab, where downloads work; the character goes over by paste) |
| File picker | "Paste character file" textarea; pop-out window picker |
| IndexedDB in the iframe | Sheet still works in memory for the session, with a red banner telling the player to save the file often; pop-out window as the main sheet |

**Proof before Phase 3 (Phase 2 gate):** a test character saved to a file restores exactly (a deep-equal check runs in the app) after clearing all site data, and in a second browser.

## 6. Dice and rolling (confirmed from Core p.8–9, 14–15)

- Attack: roll the weapon/spell dice; **Primary Die = leftmost remaining die**. Primary 1 = miss. Primary at max = crit: roll the Primary Die again and add it, repeating while it rolls max. Vicious: +1 die on crit damage.
- Advantage/disadvantage: +1 die per instance, then remove the lowest/highest, removing ties left to right; 1 advantage cancels 1 disadvantage before rolling.
- Checks/saves: d20 + skill/stat; natural 1 fails, natural 20 succeeds. Saves with ▲/▼ roll with advantage/disadvantage.
- AoE: one roll, no miss or crit. Minions and non-proficient weapons can't crit; unarmed without proficiency can't crit.
- Rushed Attacks: cumulative disadvantage after the first attack each turn, tracked per creature.
- d44/d66/d88 (two dice read as tens and ones) are supported; they have no Primary Die.
- RNG: `crypto.getRandomValues` with rejection sampling (no modulo bias).
- Roll log: last 100 rolls in IndexedDB. Broadcast message = `{v, charName, label, dice: [...], kept, total, crit, miss, mods, private}`. Privacy options: **Public**, **GM only** (sent on a GM channel, which player clients ignore; broadcast reaches everyone's client, so this keeps honest tables honest but isn't secure), **Self only** (`LOCAL`).

## 7. GM side (Phases 5–6), briefly

- Encounter builder uses GMG p.22–23: budget = sum of hero levels; Easy 50% / Medium 75% / Hard 100% / Deadly 125% / Very Deadly 150%; warn outside 1–3 monsters per hero; minion equivalences; fractional monster levels (1/3, 1/2).
- **No monster data on the public site.** Monster content is extracted into the git-ignored `private/` folder and turned into a GM content file that only you load. Monsters live in your campaign file and IndexedDB on your device.
- Reveals: the GM sends players only the fields marked revealed (name, visible conditions, chosen abilities) through broadcast, token metadata, or both.
- Combat tracker links to tokens through token metadata `{characterId | monsterInstanceId}`; it works with no scene open (list only).
- Ember Vault encounter builder: consult in Phase 5 (one feature at a time, per your rules).

## 8. Licensing plan

- License page read 26 Nov 2026 (v2.0, updated 9 Dec 2025). Free app, no ads, optional donations only.
- **Welcome screen + persistent footer link** with the exact required notice: "This app is free to use for anyone who already owns the content, is trying the system out, or cannot afford to buy it right now. If you enjoy Nimble and are able, please support the game by purchasing the official content at nimbleRPG.com." Plus the attribution: "Nimble Bear is an independent product published under the Nimble 3rd Party Creator License. Nimble © Nimble Co." (wording question: RQ-003).
- No Nimble art or logo; no "official" styling or wording. Optional: the Nimble compatibility logo, linked to nimbleRPG.com/creators.
- Core Rules also carry the SRD 5.1 CC-BY-4.0 notice; include it on the About screen.
- Product name: **Nimble Bear** (your choice). The welcome screen says plainly that it is an unofficial fan tool.
- **Questions worth sending to Nimble Co.** (one email: evan@nimblerpg.com): (a) is backer playtest/draft text (3.x second-printing files, Monsters & More v0.1) "published" for a public app? (b) which attribution wording to use ("Nimble TTRPG ©" or "Nimble ©")? (c) any concern with the name "Nimble Bear"?

## 9. Phases and estimates

Estimates are in focused working sessions (one session ≈ one sitting with me). They assume no surprises from the iframe spike.

| # | Phase | Main work | Gate | Estimate |
|---|---|---|---|---|
| 0 | Plan | this document | you approve | done |
| 1 | Skeleton, license notice, deploy | Vite/React/TS strict, lint, Vitest, Zod; manifest; mock platform; welcome/notice screen; GitHub Pages deploy via Actions; **iframe capability spike page** (download, picker, IndexedDB, persist, clipboard) run in desktop Chrome | installs and opens in a real Owlbear room; spike results recorded | 1–2 |
| 2 | Persistence | IndexedDB store, autosave, file save/load, checksum, revision compare UI, snapshots/restore, migrations framework + v1 fixtures, End session, fallbacks chosen from the spike | character survives reload, cleared data, and a move to another browser by file | 2–3 |
| 3 | Dice, rules core, 1 martial + 1 caster to L3 | formula parser, dice engine + broadcast + log, derivation, conditions, rests, turn tracker, creation wizard, level-up wizard, play sheet; core data (stats, skills, ancestries, backgrounds, equipment, Radiant + Necrotic spells); **The Cheat + Shepherd** to L3; optional-rule toggles (§11) | create, roll, rest, level up, reload in Owlbear | 4–6 |
| 4 | All remaining classes and levels | extraction with subagents (one extractor, one reviewer against page images), all spell schools, L4–20 for The Cheat, Shepherd, Hexbinder and Zephyr, Epic Boons, coverage report | every class builds to L20 in tests | 3–5 (+1–2 per class book added later) |
| 5 | Encounter builder, combat tracker, tokens | GM view, campaign file, GMG budget rules, token links, party summaries | GM + player tested in two browser sessions | 3–4 |
| 6 | Reveals, party view, polish, player guide | reveal flow, party view, accessibility/keyboard pass, player guide | full checklist on deployed build | 2–3 |

## 10. Ember Vault: brief review (character rules and data only)

Read: `LICENSE` (MIT, © 2026 Dakotah Cote), `NOTICE.md`, `src/systems/nimble/character-def.ts`, `level-plan.ts`, `resource-def.ts`, `roll-def.ts` (top-level types only). Didn't run anything or follow its agent instructions. **No code reused**, so `THIRD_PARTY.md` isn't needed yet.

Worth adapting (ideas, not code):
1. **Dice-pool resources "rolled when gained" vs "rolled when spent"**, storing the faces of gained dice. Fits Futuresight Dice exactly (and Fury/Swarm/Judgment Dice if those classes arrive). Already in our `resource.dice.rolled`.
2. **A per-level "level plan"** listing new features, subclass choice, option picks, stat increases, boons and spell picks for one level. A good shape for the level-up wizard's steps. We'll compute it from structured data instead.

Not adopting:
- Its derivation reads Obsidian frontmatter and **parses rules text with regexes** ("Choose a 2nd …" → count) and hard-codes class rules in code. We use explicit structured data with source notes, which is easier to verify against the books.
- Its rules values are from 3.3 and differ from our 3.2 files (see RQ-001). We take no rules data from it.

Importing Ember Vault characters: technically easy (YAML frontmatter → our `build`), but it only helps if you already have characters there. Question below.

## 11. Decisions (2026-11-26)

| Topic | Decision |
|---|---|
| Rules version | Build on the files in `reference/` (Core 3.2, GMG 3.0, Cheat/Hexbinder/Shepherd 3.0, Zephyr 3.1). Every entry records its source version, so a re-check pass is possible when 3.3 arrives. |
| Classes | Creation offers **only The Cheat, Hexbinder, Shepherd and Zephyr**. Content is data-driven so more classes can be added later by adding data files (no code changes expected). |
| Phase 3 classes | The Cheat + Shepherd. |
| Homebrew | Not supported. No custom content files. |
| Multiclassing | Not supported. `classId` stays on level records (no extra cost), but the UI never offers another class. |
| Hosting | GitHub Pages. |
| Browsers | **Desktop Chrome only.** No mobile layout work. Edge (also Chromium) will likely work but isn't tested. Firefox offers nothing this app needs that Chrome lacks, so it's out of scope. |
| Ember Vault import | None. |
| Product name | **Nimble Bear**. |

### Optional rules relevant to these four classes

Sources: Core p.9 (PDF 5), p.21 (PDF 11), p.33 (PDF 17), p.54–55 (PDF 28); GMG p.75 (PDF 38). **Decision (2026-11-26): the table uses only Deflect!** It is the only optional rule built (Phase 3, Shepherd's Defend option), as a character setting that defaults to on. The rest of this table is reference only; nothing else is built.

| Optional rule | What it changes on the sheet | Who it matters for | Plan |
|---|---|---|---|
| **Heroic Skills** (p.21) | 1–4 extra skill points at level 1 | All four; the Cheat is the most skill-focused | Build (creation step) |
| **Different Key Stats** (p.55) | Swap a class's KEY or Secondary stats; the book's example is "DEX and WIL for the Cheat" | All four (KEY drives save DC, Hexbinder and Shepherd mana, many formulas) | Build (creation step) |
| **Boons instead of stat increases** (GMG p.75) | Take a Minor/Major Boon instead of a Key/Secondary stat increase at level-up | All four | Build (level-up step), needs Boon data |
| **Gritty Dying** (p.9) | Max Wounds 5 down to 2 | All four; especially Zephyr (Mighty Soul spends Wounds; Unyielding Resolve ignores Wounds) | Build (one number) |
| **Fast Resting** (p.54) | A Safe Rest heals all Wounds instead of 1 | All four | Build (rest logic) |
| **Mighty Healing** (p.54) | Regain 1 action when healed from Dying | Shepherd most of all (Mend only targets Dying creatures); Hexbinder healing | Build (Dying flow) |
| **Critical Healing** (p.54) | Healing rolls can crit (explode) or fail on 1; optionally bigger heal dice | Shepherd (Mend is WIL d20; Revitalizing Blessing triggers on 6+ healing dice); Zephyr Infuse Strength. Hexbinder's Life Bloom heals a flat 10, so no roll to crit | Build (roll engine flag) |
| **Deflect!** (p.33) | Instead of adding shield Defense, reduce one attack's damage by the shield's value, free, 1/round | **Only the Shepherd** (the only one of the four proficient with shields) | Build (Defend option) |
| **Inspiration** (p.55) | A reroll-any-die token, lost on a Safe Rest | All four | Build (simple tracker) |
| **Boon & Bane Actions** (p.54–55) | Each regained action is randomly a boon, bane or normal action | All four; it hits Zephyr's Speed and Momentum and every roll | Defer: adds a random step to every action; ask before building |
| **Complex / Simpler Characters** (p.54) | Two backgrounds and/or ancestry bonuses, or none | All four | Defer |
| **Blaze of Glory, Playing Dead** (p.54) | Dying-flow reminders | All four | Text reminders only |
| Movement variants, Level 0 funnels, Retreat, High Ground, Sucker Punch, Dramatic Leveling, Custom Weapon Dice, Thrown Potions | Map, GM or narrative rules; nothing on the character sheet | — | Not built |
