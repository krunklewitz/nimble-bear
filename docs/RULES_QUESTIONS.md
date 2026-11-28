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
Core p.13 (PDF 7): a single-digit total gives 1 action, 2 digits gives 2, and 20+ (or a natural 20) gives 3. A negative total isn't covered. Planned reading: anything under 10 gives 1 action. `unverified`.

### RQ-006 · Monsters & More is incomplete
v0.1 has placeholder text and blank pages from PDF 102. Plan: don't use it for data until a later version. Use the GMG Bestiary for the Phase 5 encounter builder. `unverified`.

### RQ-007 · Vicious: one extra die per crit, or per exploding roll?
Core p.34 (PDF 18): "Vicious. Roll 1 additional die whenever you roll crit damage." and the sidebar "Every time you roll crit damage, roll the additional Vicious die as well!" Planned reading: one Vicious die with every crit roll (each explosion). Status: unverified.

### RQ-008 · Which weapons are "blades"?
The Core Rules never define it (only flavor text on p.23–24). Used by Hexbinder ("Weapons: Blades, Wands") and The Cheat level 20 Supreme Execution. Not needed until Phase 4. Status: unverified.

### RQ-009 · What is KEY when a hero's two Key Stats differ?
Core p.7 (PDF 4): "When an ability or spell references KEY, use one of your Key Stats." Planned: use the higher Key Stat (shown, and overridable). Status: unverified.

### RQ-010 · Gambler "All In": what die, and what is "higher than average"?
Cheat PDF 7 (printed 13): "Roll a single All In die; if it rolls higher than average, maximize ALL of your Sneak Attack dice; otherwise minimize them." No die size is given. Planned: roll one die of your Sneak Attack die size; higher than average means above half its max (e.g. 4+ on a d6). Status: unverified.

### RQ-011 · Luminary of the Forge: does Master of Twilight's Necrotic pick become Fire?
Shepherd PDF 7: Flameworker "Exchange knowledge of the Necrotic spell school for Fire." Master of Twilight (L3): "Choose 1 Necrotic and 1 Radiant Utility Spell." Planned: yes, for a Forge Shepherd the Necrotic utility pick becomes a Fire utility pick. Status: unverified.

### RQ-012 · Forge Seasoned Journeyman: scope of the bonuses
"Weaponsmith. Your weapons gain +STR damage" (weapon attacks only, not spells or the spirit?) and "Armorsmith. Your armor gains +STR Defense" (only while wearing armor?). Planned: weapon attacks only; Defense bonus only while wearing armor. Status: unverified.

### RQ-013 · Unarmed Strike damage type
Core p.34: "roll 1d4+STR"; no damage type or properties. Planned: bludgeoning is NOT assumed; shown as "unarmed". Status: unverified.

### RQ-014 · Gnome "Optimistic" reset
Core p.23: "Allow an ally to reroll any 1 die; resets when healed to max HP." Planned: one use, refilled when you're healed to max HP. Status: unverified.

### RQ-015 · Hit Dice with negative STR: can a die heal less than 0?
Core p.16: "A negative STR lowers each Hit Die you expend (e.g., a roll of 5 with −1 STR heals 4)." No minimum is given. Planned: each die heals at least 0. Status: unverified.

### RQ-016 · Armor proficiency: does Mail cover lighter armor?
Core p.32: "Defending while wearing armor without proficiency costs 1 additional action." Shepherd lists "Mail Armor, Shields"; The Cheat lists "Leather Armor". Nothing says Mail proficiency includes Leather or Cloth. Planned: only the listed category counts (a Shepherd in Cheap Hides pays 1 more action to Defend). Status: unverified.

### RQ-017 · What do "Light", "Stack", "Req. N STR" and "(max 2)" mean for equipment?
The weapon and armor tables use them (Core p.33, p.35) but no rule text defines Light (only used by Dual Wielding), Stack, the STR requirement (what happens if you don't meet it), or "+DEX (max 2)" (read as DEX counts up to +2). Planned: Light = can be dual wielded; Stack = items per slot; STR requirement shown as a warning only; max 2 caps DEX. Status: unverified.

### RQ-018 · Spells with an unusual cost or limit
Heart's Fire has "(1/round)" and Alacrity has "(1/turn)" inside their effect text (not encoded as casting limits, unlike Entice's title-line "(1/round)"); Dragonform costs 5 actions (shown as its casting time); Gravecraft has two modes with different costs (only in its text). Planned: shown as text; the player applies them. Status: unverified.

### RQ-019 · The Cheat: "If you roll less than 10 on Initiative, you may change it to 10"
Cheat PDF 3: "roll" could mean the d20 or the total; "may" is optional. Planned: the total is raised to 10 automatically (never worse for the player). Status: unverified.

### RQ-020 · Hexbinder Misery Maker: which "max" goes up?
Hexbinder PDF 3 (printed 5), level 13: "Increase the max number of Afflictions you can apply by 1." The Afflictions rule (printed 6) says "You can Afflict a max of 1 creature at a time with a max of INT different Afflictions", and level 20 Sage of Banes separately says "Hex and Misery apply 1 additional Affliction." Reviewer's reading: the cap becomes INT+1 different Afflictions (not an extra Affliction per Hex). Status: unverified; applied by hand.

### RQ-021 · Hexbinder Familiar "Protective": does it stack with a shield?
Hexbinder PDF 7 (printed 13): "Protective. Acts as a shield that grants +LVL Defense." Hexbinders have no shield proficiency. Planned: +LVL Defense always (the sheet adds it). Status: unverified.

### RQ-022 · Honorseeker Supreme Underdog: is the +1 to 2 stats lost?
Cheat PDF 8 (printed 14): "Supreme Underdog. (Replaces Supreme Execution…)". Supreme Execution gives "+1 to any 2 of your stats" plus a Vicious Opportunist upgrade the Honorseeker no longer has. Planned: keep the stat increase. Status: unverified.

### RQ-023 · Silent Blade Professional Skulker: climbing Speed value
Cheat PDF 5: "Gain a climbing Speed" with no number. Planned: shown as text. Status: unverified.

### RQ-024 · Honorseeker Tenacious Fighter and Even the Odds scaling
Cheat PDF 8: Tenacious Fighter's +1d6 "increases as your Sneak Attack dice would" (planned: follows the Sneak Attack schedule, 1d8 at L3); does its damage share the 1/turn use? Even the Odds "improves as it would" (planned: the level-13 free 1/turn use applies). Status: unverified.

### RQ-025 · Luminary of the Forge Masterwork: "you may choose twice"
Shepherd PDF 7: both Seasoned Journeyman options, or the same one twice (stacking)? Planned: by hand. Status: unverified.

### RQ-026 · Zephyr Way of Pain "Pain Sharpens the Mind": advantage on which rolls?
Zephyr PDF 5 (printed 8): "While you are Bloodied, gain advantage" — no roll type given. Planned: text only (by hand). Status: unverified.

### RQ-027 · Zephyr Way of Iron "Tempered": does it end after combat?
Zephyr PDF 5 (printed 9): gained when you roll Initiative; nothing says it ends. Planned: it stays until spent. Status: unverified.

### RQ-028 · Spell layout oddities (Lightning, Core p.48)
Arc Lightning's header says "TIER 1, 1+ TARGET" (no field for it; shown in text); Stormlash uses "Line: 12, AoE." (stored as its reach); Seething Storm's grey line "+2 Reach and +2 lightning bolts each round" has no "Upcast:" label (kept in text). Planned: as described. Status: unverified.

### RQ-029 · Natural Talent boon: does "any cantrip" include utility cantrips?
GMG p.75: "Natural Talent. Learn any cantrip." Utility spells are printed as "… UTILITY CANTRIP" (Core p.52), but Unnatural Talent separately grants a Utility Spell. Planned: school cantrips only. Status: unverified.

### RQ-030 · How much of the Monster Budget does a minion use?
GMG PDF 12 (printed 23), checked against the page image: "2 minions/hero: Counts as 1 monster of equal level to a hero" and "3–4 minions/hero: MUCH more challenging. 2 monsters of equal level to a hero." No per-minion cost is given. Planned: each minion costs half the party's average level (so 2 per hero = one hero-level monster; 4 per hero = two). Status: unverified.

### RQ-031 · Encounter difficulty between the printed percentages
GMG p.22 names Easy 50%, Medium 75%, Hard 100%, Deadly 125%, Very Deadly 150%, and says "less than [all of the budget]: Medium or Easy; greater than that: Deadly, or Very Deadly". Planned: an encounter gets the highest band whose percentage it reaches (below 50% is still Easy). Status: unverified.

## Resolved

### RQ-R1 · Which die is the Primary Die after advantage/disadvantage?
Core p.9 (PDF 5), checked against the page image: roll the extra dice, remove the lowest (advantage) or highest (disadvantage), and remove tied dice left to right. The Primary Die is the leftmost die that remains. Example 2 (greataxe 2d6, disadvantage 2): rolls 4,1,4,4 → remove the first and third 4 → 1,4 → the Primary Die is 1 → miss. One advantage cancels one disadvantage before rolling.

### RQ-R2 · Epic Boons location
Classes cite "pg. 75 of the Game Master's Guide". Confirmed at GMG PDF 38 (printed 75).

### RQ-R3 · Starting skill points
The quick builds have 4 more skill points than "mark your stat values" (Core p.20) explains. Core Glossary p.56 (PDF 29): "Skill Points. Use them to increase your skills. Start with 4 at level 1 and gain 1 each level." Both quick builds (Cheat PDF 9, Shepherd PDF 9) match this. Moving a point may take a skill below its stat value (Shepherd quick build level 2: Naturecraft +3 → +2). Separately, p.20 "Heroic Skills" is an optional rule giving 1–4 skill points on top of these (not used at this table).
