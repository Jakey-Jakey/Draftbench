# gpt reviews claude

## High-level read
This is a very “raid boss” build: extremely hard to affect (AC 23, very high saves + Magic Resistance + LR, frequent temp HP, divination shutdown) while also outputting high DPR and strong control via both spells and legendary actions. It will feel like fighting a CR 26–28 villain more than CR 24, and it risks pushing play into “no agency” territory (forcecage/maze/hold monster/stun loops + counterspell + slot regeneration).

If your goal is **CR 24**, you’ll want to trim defenses and/or throttle the “spell dominance + recharge/regain” loops. If your goal is **final-boss Doom**, the kit is on theme—but I’d still adjust a few mechanics to reduce frustration and bookkeeping.

---

## CR accuracy (DMG math + practical table feel)

### Defensive CR is likely higher than 24
- **HP 367** maps to about **DCR ~20** baseline.
- **AC 23** is ~+4 over expected (19-ish at that tier), which bumps defensive CR about **+2** → ~**22**.
- Then you stack **Legendary Resistance (3/day)**, **Magic Resistance**, very high saves, and—most importantly—**a repeatable 40 temp HP bonus action**.
  - A boss that can add ~40 temp HP *most rounds* effectively adds 80–160+ “virtual HP” over a typical 3–5 round fight (and can do it while still full-attacking).
  - That pushes effective durability into the **mid/high 20s**.

**Recommendation (pick one direction):**
- **If keeping CR 24:** constrain Force Field (see below) and consider dropping AC to 21–22 or lowering base HP.
- **If keeping these defenses:** label him **CR 26–28** and raise lair DCs accordingly.

### Offensive CR is also likely higher than 24 in real play
- Baseline turn DPR (three Energy Blasts) is ~**97–100** before legendary actions.
- Add **Legendary Actions**: an extra **Energy Blast (~32)** each round is common, putting you around **130+** DPR sustained.
- But the real spike is **“Cast a Spell (7th level or lower)” as a legendary action**—that can be *forcecage*, *finger of death*, *maze*, etc., delivered off-turn and potentially deciding the fight without counterplay.
- Attack bonus **+16** and save DC **24** are also above typical expectations for CR 24 (which tends to assume ~+13 to hit / DC ~21), nudging OCR upward.

**Recommendation:**
- For **CR 24**, cap legendary spellcasting to **5th level** (or a curated list), and/or make the 7th-level legendary cast **1/Day** or **Recharge 6**.

---

## Mechanical balance & gameplay pain points (actionable)

### 1) **Force Field (Bonus Action) is the biggest balance lever**
As written, Doom can refresh **40 temp HP every turn** with no limit. Temp HP doesn’t stack, but this still functions like “regenerate 40” unless the party can consistently outpace it.

**Fix options (choose one):**
- **Recharge:** “Force Field (Recharge 5–6).”
- **Limited uses:** “3/Day” or “PB/Day.”
- **Duration-based:** “40 temp HP for 1 minute; can’t be used again until the temp HP are gone.” (common boss-shield pattern)
- **Lower value:** 20–25 temp HP if it remains at-will (still strong).

### 2) **Power Absorption creates a slot-refund feedback loop**
Trigger is broad (any spell ≤6th that misses or is saved against), and Doom already has:
- Very high saves + Magic Resistance (+ frequent success)
- *Globe of invulnerability* / *counterspell* options
This can become “the party should never cast spells,” which is usually not fun at high level.

**Tighten it:**
- Add **“once per round”** (or “once per turn”).
- Cap refund: **“can’t regain a slot higher than 3rd/4th.”**
- Require meaningful tradeoff: “Doom must use his reaction” (you already do) *and* “can’t use Shield Protocol that round” (mutually exclusive by reaction economy, but stating the intended tension helps).
- Alternative: instead of slot refund, gain **temp HP** or **charge a Doom Blast** style meter (less oppressive to casters).

### 3) Legendary Action spellcasting up to 7th is swingy and often uninteractive
*Forcecage* and *maze* are especially punishing as off-turn legendary casts:
- *Forcecage* has **no save** and can delete a PC from the fight.
- *Maze* has **no save** and removes a PC with only an Int check to return.

**Recommended change (most important for table fun):**
- Change **Cast a Spell (Costs 3 Actions)** to **“casts a prepared spell of 5th level or lower”** (classic monster design).
- Or restrict to a curated list that stays interactive: *counterspell, dispel magic, misty step, fireball, hold monster* (even hold monster is harsh, but at least it’s a save).

### 4) Electroshock stun is very strong as an AoE legendary action
DC 24 Con save + **stunned until end of Doom’s next turn** can lock down melee PCs repeatedly.

**Tuning ideas:**
- Make it **single-target** (still scary).
- Or keep AoE but change to **“stunned until the end of the target’s next turn”** (shorter lock).
- Or allow a repeat save: “At the end of each of its turns, a creature can repeat the save, ending the effect on itself on a success.”

### 5) AC 23 + Shield Protocol can create “nothing hits”
AC 23 is already high; Shield Protocol effectively makes it **28** for a round. That can be fine at epic tier, but combined with temp HP and resistances it can stall the fight.

**Options:**
- Limit Shield Protocol to **3/Day**, or
- Lower base AC to **21–22**, keeping the “shield moment” meaningful.

---

## Thematic representation (Doctor Doom)
You nailed the “science + sorcery tyrant” vibe: heavy armor, force tech, wizard-grade spellcasting, doombots, lair surveillance.

A few theme-forward improvements that also help play:
- **Doombot deception (iconic Doom):** consider a “failsafe” trait:
  - *If Doom is reduced to 0 hit points outside his lair, there’s a chance it was a Doombot; the real Doom learns the party’s tactics.*  
  Mechanically, this can be a **Mythic Trait** or a narrative escape hatch to avoid anticlimax.
- **Ruler/strategist angle:** add a command/support legendary action like:
  - “**Command Doombot.** One allied construct within 60 ft. uses its reaction to move/attack.”
- **Tech-magic hybrid:** consider swapping some generic wizard staples for Doom-flavored control:
  - *telekinesis, wall of force, globe of invulnerability, animate objects* (if you want “armor components”), *steel wind strike* (if leaning arcane), etc.

---

## Formatting & 5e conventions issues

### Energy Blast damage modifier mismatch
- It’s a **Ranged Spell Attack +16**, implying Int-based (+9) + PB (+7).
- But damage is **5d10 + 5**. Where does +5 come from?

**Fix:** make it one of:
- **5d10 + 9** (Int to damage, consistent with many monster spell-attacks), or
- **5d10** flat, or
- Explain the +5 as armor output (and then consider making it consistent across abilities).

### Lair action DCs are oddly low
Your lair action DCs are **18**, while Doom’s spell DC is **24**. For a CR 24+ lair, DC 18 will be trivial for many PCs.

**Fix:** set lair DC to **22–24**, or tie it explicitly:
- “Save DC = 8 + PB + Intelligence modifier (DC 24).”

### Doombot reference is unclear / inconsistent
“Use archmage statistics… no spellcasting… instead attacks…” is workable, but it’s easy to misrun because archmage is defined largely by spells.

**Fix:** write a short **Doombot** stat block (AC/HP/saves/attacks/features) or base it on a construct like **shield guardian/helmed horror** and adjust.

### Spellcasting block complexity
A full 20th-level wizard prep list is a lot at the table, especially with legendary spellcasting and slot-regain mechanics.

**Fix options:**
- Convert to **Innate Spellcasting** with “at will / 3/day / 1/day” for the spells you actually expect to use.
- Or keep slots but prune the list to ~10–14 spells that define his tactics.

---

## Action economy review
Doom currently has:
- Full multiattack (3 attacks) **plus** optional spell substitution
- Strong bonus actions (teleport + force field)
- Strong reactions (shield + slot regain)
- 3 legendary actions, including high-level spellcasting
- Lair actions, including doombot spawning and slot regain

That’s “solo boss + phase boss” levels of throughput. It will overwhelm many parties unless they’re very optimized.

**Recommended action-economy simplification (if targeting CR 24):**
- Keep **either** (A) “Multiattack + tech blasts” **or** (B) “full caster turns,” and let legendary actions cover the other.
  - Example: remove “replace one attack with a 5th-level spell” and instead add a legendary action “Cast a Spell (Costs 2 Actions): 3rd level or lower.”
- Make **Tactical Teleport** either a **legendary action** (1 action) *or* a bonus action (not both capabilities available every round via other options).

---

## Specific suggested changes (quick patch sets)

### If you want to keep **CR 24**
1. **Force Field:** Recharge 5–6 *or* 3/day (40 temp HP).
2. **Legendary spellcasting:** cap at **5th level** (or curated list).
3. **Power Absorption:** once/round; refund max **3rd/4th** level slot (or temp HP instead).
4. **Lower one defensive dial:** AC 22 (or HP ~330).
5. **Raise lair DCs** to 22–24 so lair remains relevant after nerfs.

### If you want “final boss Doom” at **CR 27ish**
1. Keep most of it, but still:
   - Limit Force Field (otherwise the fight can become a slog).
   - Restrict *forcecage/maze* usage (1/day each, or only on his turn, or only at bloodied).
2. Increase lair DCs to **24** and ensure Doombot spawning has a cap (e.g., “max 1 active” or “3/encounter”).

---

If you tell me the intended party level/composition (e.g., 4 level-20 PCs vs 6 level-17 PCs) and whether this is meant to be a **solo fight** or **Doom + minions**, I can give a tighter CR estimate and propose a cleaned “table-ready” version of the statblock with adjusted numbers.