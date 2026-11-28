# Data extraction guide

For anyone (human or agent) turning rulebook pages into `src/data/content/**/*.json`. The schema is `src/data/schema.ts`; `npx vitest run tests/content.test.ts` validates every file and its cross-references.

## Hard rules
1. **Only `reference/` PDFs.** Never fill anything in from memory, other apps, Ember Vault or the web. If a page doesn't say it, it isn't in the data.
2. **Read every page two ways.** Text: `pdftotext -f N -l N -layout reference/FILE.pdf -`. Image: `pdftoppm -f N -l N -r 110 -png reference/FILE.pdf <your-scratch-folder>/img`, then view the PNG. Pages are two-page spreads with two or more columns, and the text output interleaves columns. **The image is the authority.**
3. **Verbatim text.** `text`, `description`, `upcast`, `highLevels`, `restriction`, `propertiesText` are copied exactly as printed (keep “curly quotes”, en/em dashes, ×, », capitalization). Only rejoin words hyphenated across a line break ("com-\npatibility" → "compatibility") and join wrapped lines with single spaces.
4. **Source on everything.** `source: { file, version, pdfPage, printedPage, status }`. PDF page = the page number in the PDF. Printed page = the footer number of the half of the spread the entry is on. Core/GMG/class files: PDF *n* (n ≥ 2) holds printed 2n−2 (left half) and 2n−1 (right half).
5. **`status: "verified"`** only when you checked the entry against the page image. Anything unclear, cut off, contradictory or interpreted → `"unverified"` with a `note`, and list it in your report.
6. **Don't over-automate.** Encode effects only when the text clearly says so. Otherwise use `{ "type": "text" }` with `automation: "partial"` or `"manual"` and a short `manualNote` saying what the player does by hand. A missing automation is fine; a wrong one is a bug.
7. **Only your assigned files.** Don't edit other content files, source code, tests or docs. Don't commit.

## Conventions
- **IDs** (lowercase, words joined by `-`, sections by `.`):
  - ancestries `ancestry.<slug>`, backgrounds `background.<slug>`, their features `feature.<ancestry|background>.<slug>.<feature-slug>`
  - classes `class.<slug>` (`class.cheat`, `class.shepherd`), class features `feature.<class>.<slug>`, subclasses `subclass.<class>.<slug>`, subclass features `feature.<class>.<subclass>.<slug>`
  - items: `armor.<slug>`, `shield.<slug>`, `weapon.<slug>`, `gear.<slug>`; spells `spell.<school>.<slug>`; conditions `condition.<slug>`
  - Slug: lowercase name, apostrophes and punctuation removed, spaces and `/` → `-`. "Adventurer’s Garb" → `armor.adventurers-garb`; "Club/Mace" → `weapon.club-mace`; "THAT’S Not What Happened!" → `that-s-not-what-happened` is wrong, use `thats-not-what-happened`.
  - Repeated level-table features ("Sneak Attack (2)") are separate features: `feature.cheat.sneak-attack-2`.
- **Formulas** (`src/data/schema.ts` → `Formula`): numbers, `LVL`, `KEY`, `STR` `DEX` `INT` `WIL`, `var.<name>`, `+ - * ( )`, `min()`, `max()`, `floor()`, `half()`, dice `1d6`, `2d4+DEX`, `WIL d20` (WIL × d20), `d66`, `1d100`. "(WIL×3)+LVL" → `"(WIL*3)+LVL"`. "6+DEX (max 2)" → `"6+min(DEX,2)"`.
- **Stats** are `STR` `DEX` `INT` `WIL`. Skills are `arcana examination finesse influence insight lore might naturecraft perception stealth`. Modifier target for one skill: `skill.stealth`; all skills: `skills.all`.
- **Limits** "(1/turn)", "(2/encounter)", "(WIL/Safe Rest)" → `limit: { uses: "1", per: "turn" }`, `{ uses: "WIL", per: "safeRest" }`.
- **Scaling class numbers** (Sneak Attack dice) go in `vars` on the class and are changed by `setVar` in the level features.
- **Level tables**: `levels["1"]` lists the feature ids gained at that level, in printed order. Stat increase lines are features with a `choice` of kind `stat`.

## Worked examples (from pages already checked)

Human (Core Rules PDF 12, printed 22):
```json
{
  "id": "ancestry.human", "name": "Human", "rarity": "common", "sizes": ["medium"],
  "description": "Found in every terrain and environment, their curiosity and ambition drive them to explore every corner of the world, making them a ubiquitous and versatile race.",
  "features": [{
    "id": "feature.ancestry.human.tenacious", "name": "Tenacious", "text": "+1 to all skills and Initiative.",
    "effects": [
      { "type": "modifier", "target": "skills.all", "op": "add", "value": "1" },
      { "type": "modifier", "target": "initiative", "op": "add", "value": "1" }
    ],
    "automation": "full",
    "source": { "file": "NimbleCoreRules3.2.pdf", "version": "3.2", "pdfPage": 12, "printedPage": 23, "status": "verified" }
  }],
  "source": { "file": "NimbleCoreRules3.2.pdf", "version": "3.2", "pdfPage": 12, "printedPage": 23, "status": "verified" }
}
```

Dagger (Core Rules PDF 18, printed 35):
```json
{
  "id": "weapon.dagger", "name": "Dagger", "group": "melee", "damage": ["1d4+DEX"], "damageType": ["piercing"],
  "propertiesText": "Light, Thrown 4", "properties": { "light": true, "thrown": 4 },
  "tags": ["melee", "dex"], "cost": "3 gp",
  "source": { "file": "NimbleCoreRules3.2.pdf", "version": "3.2", "pdfPage": 18, "printedPage": 35, "status": "verified" }
}
```
Weapon `tags`: `melee`/`ranged`; `str` and/or `dex` from the damage stat. The Core Rules never define which weapons are "blades" (RQ-008), so no `blade` tag until that is answered.

Sneak Attack (The Cheat PDF 3, printed 4):
```json
{
  "id": "feature.cheat.sneak-attack", "name": "Sneak Attack",
  "text": "(1/turn) When you crit, deal +1d6 damage.",
  "effects": [
    { "type": "setVar", "var": "sneakAttack", "value": "1d6" },
    { "type": "rollOption", "option": { "id": "roll.cheat.sneak-attack", "label": "Sneak Attack", "on": "damage", "change": "addDice", "value": "var.sneakAttack", "mode": "auto", "when": { "situation": "This attack crit" }, "limit": { "uses": "1", "per": "turn" } } }
  ],
  "automation": "full",
  "source": { "file": "TheCheat3.0.pdf", "version": "3.0", "pdfPage": 3, "printedPage": 4, "status": "verified" }
}
```

Spell layout: each spell has a header line (tier or CANTRIP, optional AOE), name, action cost, then fields like `Reach: 4.`, `Range: 12.`, `Damage: 1d8 (ignoring armor).`, `Concentration: 1 min.`, restriction lines (`Castable only while Defending.`), effect text, and optional `High Levels:` (cantrips) and `Upcast:` lines. Put each field in its own property; `text` holds everything except Upcast/High Levels lines, verbatim, in printed order (including the `Reach:`/`Damage:` sentences).

## Report back
List: files written, entry count, every `unverified` entry and why, every effect you chose not to automate, and questions for the rules owner. Run `npx vitest run tests/content.test.ts` and include the result for your files.

## Phase 4 conventions (levels 4–20, option pools, boons)
- **Level tables 1–20:** `levels["4"]`…`levels["20"]` list every printed feature id in order. Repeats get a suffix: "Underhanded Ability (2)" → `feature.cheat.underhanded-ability-2`.
- **Option pools** (Underhanded Abilities, Sacred Graces, Afflictions, Mystic Marks, Martial Arts Abilities, Honorable Gambits): each option is a FeatureDef inside `optionPools["<class>.<pool>"]` on the class (or subclass, for subclass-only pools like Honorable Gambits). Pool ids: `cheat.underhanded`, `cheat.honorable-gambits`, `shepherd.sacred-graces`, `hexbinder.afflictions`, `hexbinder.mystic-marks`, `zephyr.martial-arts`. Option ids: `feature.<class>.<pool-short>.<slug>`, e.g. `feature.cheat.underhanded.misdirection`.
- **Picking from a pool:** the level feature ("Underhanded Ability. Choose an Underhanded Ability." / "(2). Choose a 2nd …") has a `choice` with `from: { kind: "pool", pool: "<pool id>" }`, `count: 1` (or the number printed). Choice id: `choice.<class>.<feature-slug>`, e.g. `choice.cheat.underhanded-ability-2`. Options already picked are hidden by the engine; don't repeat them.
- **Options granted outright** ("You know the Withered and Frenzied Afflictions") → `choice` is NOT used; give the feature a `text` effect and list the granted option ids in `manualNote`, or, better, use a `spells`-style grant: put them as a `choice` of kind `options` only if the player chooses. If unsure, `text` + note.
- **Stat increases:** "Key Stat Increase. +1 DEX or INT." → `choice` `{ kind: "stat", stats: ["DEX","INT"], amount: 1 }`, count 1, id `choice.<class>.key-stat-<level>`. "Secondary Stat Increase. +1 WIL or STR." → same with the secondary stats, id `choice.<class>.secondary-stat-<level>`. "+1 to any 2 of your stats" → `stats: ["STR","DEX","INT","WIL"]`, `count: 2`, id `choice.<class>.capstone-stats`.
- **Epic Boon** (level 19): `choice` `{ kind: "pool", pool: "boons.epic" }`, count 1, id `choice.<class>.epic-boon`.
- **Subclass features at 7/11/15:** `subclass.levels["7"]` etc. Class level-table "Subclass. Gain your … subclass feature." lines are class features with a `text` effect (the engine adds the subclass's own features at that level).
- **Pool swaps** (Honorseeker: "For every Underhanded Ability you would have (except for your Old Habits…), choose an Honorable Gambit instead") → effect `{ type: "replacePool", from: "cheat.underhanded", to: "cheat.honorable-gambits", except: ["choice.cheat.honorseeker.old-habits"] }`.
- **Class spell lists** (Hexbinder): spells go in `spells/hexbinder.json` with `school: "hexbinder"`; tier unlock features use `{ type: "spells", list: "hexbinder", maxTier: N }`.
- **Choosing a spell school** (Hexbinder Coven): `choice` `{ kind: "school" }` (optionally `schools: [...]`).
- **Upgraded Cantrips / scaling text** stays `text`; the cantrip's own `highLevels` line describes it.
