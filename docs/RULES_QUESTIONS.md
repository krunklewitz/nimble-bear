# Rules questions

Anything missing, unreadable or ambiguous in `reference/`. Open entries block the data they affect, which stays `unverified` until answered.

## Open

### RQ-001 · Rules version mismatch
**Decision (2026-11-26):** build on the files present; re-check every entry when 3.3 files are added.
The target is Nimble 2.0 / rules 3.3. The files are Core Rules **3.2**, GMG **3.0**, Cheat/Hexbinder/Shepherd **3.0**, Zephyr **3.1**, Monsters & More **v0.1**. Only filenames carry these numbers; inside, the books say only "Second Printing".
Evidence that the gap changes real numbers: Ember Vault's code cites "Core Rules 3.3" and uses a level-up average HP table of d4 2 / d6 3 / d8 4 / d10 5 / d12 6 / d20 10. Core Rules 3.2 p.21 (PDF 11) says d4 +3 / d6 +4 / d8 +5 / d10 +7 / d12 +8. The Cheat quick build (Cheat PDF 9) goes from 10 to 14 HP at level 2, which matches 3.2.
Nimble's blog (2 Nov 2026) says the updated books are in final playtest, with final digital files expected about December 2026.
**Ask:** Do you have the 3.3 files? If so, add them to `reference/`. If not, should we build on 3.2/3.0 now and re-check every entry when 3.3 arrives? (Each data entry records its source file and version, so a diff pass is possible.)

### RQ-002 · Eight core classes are missing
**Decision (2026-11-26):** creation offers only The Cheat, Hexbinder, Shepherd and Zephyr. More classes later, by adding their PDFs and data.
Core p.18–19 (PDF 10) lists 11 core classes. Only The Cheat, Shepherd and Zephyr are present, plus Hexbinder (an expansion hero). Missing: Berserker, Commander, Hunter, Mage, Oathsworn, Shadowmancer, Songweaver, Stormshifter.
**Ask:** Do you own the Core Heroes (and any other expansion heroes)? Phase 4 "all remaining classes" can only cover classes whose files are in `reference/`.

### RQ-003 · Required attribution wording differs
- Every PDF's license page, plus the Core Rules and GMG (printed Oct 2026): "…Nimble 3rd Party Creator License. Nimble **TTRPG** © Nimble Co."
- nimbleRPG.com/pages/creators (license v2.0, updated 9 Dec 2025), and the Monsters & More v0.1 draft: "…Nimble 3rd Party Creator License. Nimble © Nimble Co."
The required free-app notice is identical in both.
**Plan unless you object:** use the website's wording exactly, since it is the current published license. Optionally confirm with Nimble Co.

### RQ-004 · Is draft or playtest content "published Nimble text"?
The license allows "any and all published Nimble text" in free apps. Monsters & More v0.1 is a backer-only draft, and the 3.x second-printing files are playtest files sent to backers. Whether a public app may include text from them is a question for Nimble Co. This affects any class text on the public site, so it matters before Phase 3 goes public. Monsters aren't bundled anyway (GM-only file).

### RQ-005 · Initiative with a total below 0
Core p.12 (PDF 7): a single-digit total gives 1 action, 2 digits gives 2, and 20+ (or a natural 20) gives 3. A negative total isn't covered. Planned reading: anything under 10 gives 1 action. `unverified`.

### RQ-006 · Monsters & More is incomplete
v0.1 has placeholder text and blank pages from PDF 102. Plan: don't use it for data until a later version. Use the GMG Bestiary for the Phase 5 encounter builder. `unverified`.

## Resolved

### RQ-R1 · Which die is the Primary Die after advantage/disadvantage?
Core p.9 (PDF 5), checked against the page image: roll the extra dice, remove the lowest (advantage) or highest (disadvantage), and remove tied dice left to right. The Primary Die is the leftmost die that remains. Example 2 (greataxe 2d6, disadvantage 2): rolls 4,1,4,4 → remove the first and third 4 → 1,4 → the Primary Die is 1 → miss. One advantage cancels one disadvantage before rolling.

### RQ-R2 · Epic Boons location
Classes cite "pg. 75 of the Game Master's Guide". Confirmed at GMG PDF 38 (printed 75).
