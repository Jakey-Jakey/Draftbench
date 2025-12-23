# gpt reviews claude

## Big-picture read
This statblock captures “tech + archmage tyrant” very well, but mechanically it’s **significantly above CR 25** in durability and encounter-warping control. As written, it will often feel like the party is fighting the *rules* (permanent resistance-to-spells + near-infinite counterspells + double concentration + mass summons) more than fighting Doom.

If your goal is a fair-but-deadly CR 25 solo boss for level ~17–20 PCs, I’d tune down a few specific pressure points while keeping his identity.

---

## CR accuracy & mechanical balance

### Defensive CR is likely far above 25
**Raw stats:** AC 23, HP 367 are already “boss-tier.” On the DMG table, 367 HP is in the CR 23–25 neighborhood *before* special defenses.

**But his effective HP is much higher because of:**
- **Force Field (bonus action, no limit): resistance to all damage** (functionally doubles HP if kept on).
- **Armor of Doom: resistance to all damage from spells** (this is enormous at high tier).
- **Magic Resistance** (advantage on saves vs spells).
- **Legendary Resistance (3/day)** plus an extra “Indomitable Will (3/long rest)” (see redundancy note below).
- **Regeneration 10** (effectively; more on formatting later).
- **Deflection Matrix** shaving ~35 damage off many ranged hits.

In practice, a high-level party’s damage is frequently “spell damage” and/or elemental, so Doom will often feel like he has **700–900+ effective HP**, *before* Legendary Resistance and counterplay denial.

**Actionable fix options (pick a direction):**
- **If you want to keep CR 25:** remove or sharply limit *one* of the “global halves damage” mechanics.
  - Easiest: change **Force Field** to something like **temporary hit points** (e.g., “gains 60 temp HP, 3/day”) or a **damage reduction** (e.g., “reduce damage by 15,” always-on).
  - Or replace **“resistance to all damage from spells”** with something narrower (examples below).
- **If you want to keep the kit as written:** it’s more like **CR 29–30+**, and the listed CR/XP/PB should change accordingly.

### Proficiency Bonus mismatch
You list **CR 25** but **PB +7**. By the DMG progression, **CR 25 should be PB +8**. (If you keep PB +7, Doom will “read” like CR 21–24 mechanically.)

---

## Offense (DPR, control, and “unfun” spikes)

### DPR is in the right range *until you add control + legendary casting*
Baseline round (no spells):
- **Multiattack (3× Plasma Bolt):** ~40 each → **~120 DPR**
- **Legendary Action Plasma Bolt (2 actions):** +40 → **~160 DPR/round**

That’s already around **CR 26-ish offense** on DPR alone, and his **attack bonus +16** / **save DC 24** are also above typical CR 25 baselines.

### Gauntlet Strike stun is the bigger issue than damage
“**Stunned until the end of its next turn**” on *every hit* (3 attacks/round) can easily produce **stun-lock gameplay**, especially if Doom mixes melee + legendary actions and targets one PC until they fail.

**Actionable tweak:**
- Limit the stun to **1/turn** or **recharge**, e.g.:
  - “The first time Doom hits a creature on his turn…”
  - Or “DC 21 Con save or be stunned **until the start of Doom’s next turn**, repeating the save at the end of the target’s turn.”
- Or downgrade to a strong but less binary effect: **incapacitated**, **restrained**, or **no reactions + speed 0** until end of next turn.

### Spell list contains encounter-ending “hard locks”
This is fine for a *mythic* Doom, but for “CR 25 boss fight,” spells like **forcecage**, **power word kill**, **time stop**, and **dominate monster** can end a PC’s participation with little counterplay—*especially* alongside his counterspell suite.

**Actionable options:**
- Keep them, but make Doom feel fair by telegraphing and adding counterplay (lair devices to destroy, limited charges, etc.).
- Or restrict the “boss-fight Doom” list to fewer “no-save/no-escape” moments:
  - Consider dropping **power word kill** or gating it behind a condition (e.g., only if target is below X and Doom has line of sight uninterrupted for a full round).
  - Consider making **forcecage** a **1/day** signature instead of a repeatable slot.

---

## Action economy & summons (major swing)

### Summon Doombots is an encounter breaker as written
You’re summoning **1d4+1 Shield Guardians** (CR 7 each) with only minor nerfs. That can be **2–5 CR 7 bodies** added to the field, which:
- massively increases Doom’s side’s total HP and DPR,
- can block movement/line of sight,
- and (importantly) **Shield Guardian’s printed traits** include very strong “defend the master” style mechanics unless removed.

**Actionable fixes:**
- Use a **custom Doombot statblock** (recommended) rather than “use shield guardian with changes,” and explicitly remove/avoid any master-bond damage-sharing and spell-storing complexity.
- Make it **fixed** (no swinginess): e.g., “summons **2 Doombots**.”
- Make them **weaker minions**:
  - e.g., CR 3–5 bruisers with ~60–90 HP, modest damage, and a simple “Protect Doom” reaction.
- Or make it a **lair action** or **mythic phase** ability rather than a baseline 1/day swing.

As written, this alone can push the encounter well beyond CR 25 even if Doom himself were toned down.

---

## “Anti-caster shutdown” stack (gameplay feel issue)

Right now, casters can get completely smothered by:
- **At-will counterspell** (no slot)
- **Superior Counterspell reaction** (auto-counters 4th level or lower)
- **Magic Resistance**
- **Legendary Resistance**
- **Resistance to all spell damage**

That’s five layers of “your spells don’t matter.”

**Actionable tuning (pick 1–2):**
- Make **Superior Counterspell** limited use: **3/day** (or PB/day).
- Or remove the “auto” clause and instead let him cast counterspell at a high level (e.g., “casts *counterspell* as a 5th-level spell” 3/day).
- Replace “resistance to all damage from spells” with something less absolute, e.g.:
  - “Doom has resistance to damage from spells of **3rd level or lower**.”
  - “Doom reduces damage from spells by **15** (after resistance).”
  - “Doom has resistance to spell damage **unless the spell is cast using a 7th-level slot or higher**.”

This preserves Doom as a premier anti-mage without invalidating entire characters.

---

## Double concentration (rules + balance risk)
“**He can concentrate on two spells simultaneously**” is a major rule break that enables oppressive combos (e.g., *wall of force* + *telekinesis*/*dominate*, etc.).

If you keep it, add firm rules and constraints:
- “When Doom makes a concentration check, he makes **one check** for both spells. On a failure, **both** spells end.”
- Consider limiting it: **1/day for 1 minute**, or “only one of the two can be 5th level+,” etc.

Or (simplest) remove it and instead give Doom a signature “non-concentration” tech effect (force field, drones, etc.) so he still feels like he’s multitasking.

---

## Formatting & 5e conventions (cleanups that also reduce table friction)

- **Regeneration wording:** “repairs itself, regaining 10 hit points…” should be formatted like:
  - ***Regeneration.*** Doom regains 10 hit points at the start of his turn if he has at least 1 hit point. *(Optionally add a suppression condition—acid, lightning, antimagic, etc.—for counterplay.)*
- **Spellcasting block:** If you’re using prepared slots, standard format is “Xth-level spellcaster” with slots, or use Innate Spellcasting. Also, you list *shield/counterspell* in slots but also “without expending a spell slot.” Consider:
  - Remove them from the prepared list and write “At will: *shield, counterspell*” (or limited/day).
- **Technology skill:** Not a core 5e skill. Either define it (setting rule) or convert to tools (e.g., **tinker’s tools** / **artisan’s tools**) or **Arcana/Investigation**.
- **“All languages”:** mechanically fine, but unusual. Many official blocks do “Common plus X” even for geniuses. Not required, just a style note.
- **Force Field toggling:** No duration/uses is unusual for a defensive stance that strong. Give it a duration, limited uses, or a maintenance cost.

---

## Lair actions (power level + clarity)
- Your **lair save DCs (18)** are low for this tier if Doom’s normal DC is 24. If these are meant to be serious threats, consider **DC 21–23**.
- **Neural Scrambler stun** is very swingy. Stun as a lair action can be miserable, especially if it can tag multiple PCs. Consider:
  - Change to **incapacitated** until initiative 20, or
  - Allow a **repeat save at end of turn**, or
  - Make it target **one creature** (or a small number) instead of “each creature of Doom’s choice.”

---

## Thematic representation (what you nailed + what to emphasize)
Strong theme hits:
- Tech armor + sorcery, intimidation, political authority, doombots, castle lair—very on-brand.
- Mobility (flight + teleport) fits “unreachable tyrant.”

Where theme and mechanics can align even better:
- Doom should feel like he has **resources and plans**, not just perpetual “nope” buttons. Adding **limited charges** (e.g., “Doom has 3 Reactor Charges”) for Force Field / Superior Counterspell / Disintegrator makes him feel strategic and gives players visible progress.

---

## Suggested “CR 25-friendly” tuning package (concrete)
If you want this to *play* like CR 25 without losing the Doom fantasy, here’s a coherent set of changes:

1. **Force Field (nerf):** 3/day, bonus action, lasts 1 minute. Grants **60 temp HP** and **advantage on concentration checks** (instead of resistance to all damage). No flight while active (keep that).
2. **Armor of Doom (adjust):** replace “resistance to all damage from spells” with **reduce spell damage by 15** (or “resistance to spells of 3rd level or lower”).
3. **Counterspell suite (reduce layers):**
   - Keep at-will *counterspell* **or** keep Superior Counterspell, not both.
   - If keeping Superior: make it **3/day**, and auto-counter **3rd level or lower**.
4. **Gauntlet stun (limit):** “Once per turn” and/or “repeat save at end of target’s turn.”
5. **Summon Doombots (rebuild):** fixed **2 Doombots**, each ~80 HP, AC ~18–19, modest DPR, and no shield guardian master-bond mechanics.
6. **PB/CR consistency:** set **PB +8** if CR 25, and adjust derived numbers if needed.

If you *don’t* want to nerf, then I’d instead label him **CR ~29–30**, raise PB accordingly, and treat the doombot summon as a mythic-phase or set-piece.

---

If you tell me the intended party level/composition (and whether this is meant to be “final boss” or “recurring villain who escapes”), I can recommend a tighter CR target and propose a revised statblock that keeps your signature features but plays cleaner at the table.