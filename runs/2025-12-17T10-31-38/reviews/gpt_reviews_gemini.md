# gpt reviews gemini

## High-level take
This is a scary, very “Doom” boss: armored super-genius archmage with oppressive control, great defenses, and strong action economy. The main balance issue is that several features **stack to create a near shutout for spellcasters and control-based martials**, while the listed **CR 24 is likely understated** given the effective durability and encounter-warping control (especially *forcecage* + very high DCs + slot-refund countering).

Below are the most actionable fixes, grouped by topic.

---

## 1) 5e formatting / rules-clarity issues (easy wins)

### HP math is off
- **Hit Points 325 (30d8 + 180)** is incorrect. Average of 30d8 is **135**, so total is **315**.
  - Fix to **315 (30d8 + 180)**, or change the dice to match 325.

### Nonstandard skill / language presentation
- **Technology +24** is not a core 5e skill. If your game uses it, consider formatting like:
  - **Skills** Arcana +24, …, **Intelligence (Technology) +24**
  - Or replace with **Investigation** / **Arcana** / tool proficiencies (tinker’s tools).
- Languages: “(and all other known languages via Universal Translator)” is flavorful, but mechanically should be a trait:
  - ***Universal Translator.*** Doom understands all spoken languages and can speak any language he has heard for at least 1 minute (or whatever your intended mechanic is).

### Spell list typos / oddities
- “**meticulously word of radiance**” appears to be a typo; likely **word of radiance**.
- Giving a “wizard” *eldritch blast* is fine for a monster, but it’s a flag for tables that expect class purity. If you keep it, consider framing it as a **gauntlet cantrip** or **armor-integrated emitter** (still mechanically *eldritch blast*).

### “Ranged Spell Attack” vs “weapon”
- **Gauntlet Blast** is written as a *Ranged Spell Attack* but it isn’t actually a spell. That’s okay rules-wise, but it can confuse players about *counterspell*, *globe of invulnerability*, etc.
  - If you want it to be tech (not counterspellable), consider: **Ranged Weapon Attack** that deals magical damage.
  - If you want it to be sorcery-tech (counterspellable), explicitly say it’s a spell-like effect.

---

## 2) Defensive balance & CR accuracy (biggest balance concern)

### Effective durability is far above “325 HP”
Defensively, Doom stacks:
- High base HP (315–325)
- **30 temp HP every turn** (functionally regeneration that also blocks stun)
- Multiple resistances + **force immunity**
- **Magic Resistance**
- **Legendary Resistance (3/day)**
- **Truesight + Mind Blank active** (if truly active)

In DMG terms, the temp HP alone adds “effective HP per round.” Over ~3 rounds, that’s ~**+90 effective HP**, before resistances/immunities. Then force immunity + multiple resistances pushes effective HP much higher. Result: **defensive CR trends closer to the high 20s** than 24 in many parties’ damage profiles (especially if the party leans on force spells like *disintegrate*, *magic missile*, *eldritch blast*, *spiritual weapon* in some home games, etc.).

### Force immunity is a gameplay landmine
Force is commonly used as the “reliable” damage type at high level. Full immunity tends to:
- invalidate multiple PCs’ main plans,
- and combine nastily with his own *wall of force/forcecage* dominance theme (players can’t “fight force with force”).

**Actionable options (pick one):**
1. Change **Force Immunity → Force Resistance** (most straightforward).
2. Make it conditional: immune to force **while the Personal Force Field temp HP remains**.
3. Make it limited: “immune to force damage from spells of 5th level or lower” (or similar).

### Personal Force Field is overtuned as written
“30 temp HP at the start of each of his turns” is already strong. Adding “while he has these temp HP, immune to Stunned” makes him **close to stun-proof permanently**, and (important rules nuance) if he ever becomes stunned, gaining temp HP at the start of his turn likely ends the condition immediately because he becomes immune.

**Suggested tuning knobs:**
- Reduce to **15–20 temp HP** per turn, or
- Make it **Recharge 5–6**, or
- Keep 30 temp HP but change stun protection to something softer:
  - “Doom has advantage on saves against being stunned,” or
  - “The first time Doom would be stunned each round, he isn’t.”

### Mind Blank “(active)” should be reflected
If *mind blank* is truly active, Doom is **immune to psychic damage** and immune to being charmed (and protected from many divinations). Your stat block currently lists **psychic resistance** and **charmed immunity** already—so you’re halfway there, but the psychic line becomes inconsistent.

**Suggestion:** Add a trait:
- ***Mind Blank.*** Doom is under the effects of *mind blank*.
…and then set **psychic to immunity** (or remove the spell listing and bake the effect in).

---

## 3) Offensive balance & CR accuracy

### DPR is “okay,” but control is the real lethality
Pure damage (2x Gauntlet Blast + 1 legendary blast) is around **~93/round** (before hit chance). For CR 24, that’s not outrageous, and arguably a bit low **if he’s meant to win by damage**.

But Doom wins by:
- **DC 25** control spells (banishment, hold person doesn’t work on him but works on others, etc.)
- *wall of force* / *forcecage* encounter shaping
- **time stop** setup turns
- **double concentration** enabling oppressive combos
- **Power Siphon** making enemy casters unreliable

This means the listed CR can be “functionally higher” than the DPR implies, because PCs lose turns, lose positions, or get removed from play.

### Spell DC 25 is extremely punishing
DC 25 is “endgame artifact boss” territory. Many proficient saves at level 17–20 are still in the +6 to +11 range; DC 25 makes failures frequent, and with Doom’s control kit that can spiral hard.

**If you want CR 24 to feel fair:** consider dropping to **DC 22–23** (e.g., INT 26–28 instead of 30), or keep DC 25 but reduce the “no-save”/hard-lock tools.

---

## 4) Specific mechanics likely to cause feel-bad gameplay

### Scientific Sorcery (two concentrations) is encounter-warping
Two concentration spells breaks one of 5e’s main balancing rails. With Doom’s list, the most problematic interactions are things like:
- *telekinesis* + *wall of force*,
- *globe of invulnerability* + battlefield control,
- plus *time stop* to set them up.

**Recommended constraint options:**
1. **Armor-assisted concentration:** “Doom can concentrate on two spells, but one must be from a specific ‘armor systems’ list and be **3rd level or lower**.”
2. **Cost to maintain:** “At the start of each turn while concentrating on two spells, Doom takes 10 psychic damage per spell level (or loses 10 temp HP),” etc.
3. **Riskier concentration:** “While concentrating on two spells, Doom makes concentration saves **with disadvantage**, and on a failure he loses **both**.”
4. **Limited use:** “1/day Doom can maintain two concentration spells for 1 minute.”

Any of those preserve the “Doom cheats the rules” fantasy without making it the default state every fight.

### Power Siphon will shut down casters almost completely
As written:
- It triggers on *any spell* within 60 ft,
- uses a **contested check** (not the normal counterspell mechanic),
- Doom’s Int check is huge, so he’ll win often,
- and it **refunds spell slots**, potentially creating a “the party fuels Doom forever” loop.

**Actionable rewrite (cleanest):**
- Make it a variant of *counterspell*:
  - ***Power Siphon (Reaction).*** Doom casts *counterspell* without expending a spell slot. If it successfully counters a spell, Doom regains one expended spell slot of **up to 3rd level** (or up to the countered spell’s level, maximum 5th).  
  - Uses: **3/Day** (or Recharge 5–6).
This keeps the theme while preventing infinite negation + infinite slots.

### Multiattack + “substitute one attack for Spellcasting” is too permissive
As written, Doom can potentially:
- cast a spell (even *time stop*) and still make an attack in the same action.

That’s well beyond normal monster patterns and will spike his output unpredictably.

**Fix:** constrain the substitution:
- “He can replace one attack with casting a **cantrip**,” (common on NPCs)
or remove the substitution entirely:
- Give him “Multiattack” **or** “Spellcasting” as separate action choices.

### Forcecage at DC 25 can remove a PC from play
*Forcecage* is already infamous because it often means “one character doesn’t participate.” With DC 25, the escape clause becomes unlikely.

**If you keep *forcecage*:**
- Consider making it **1/day**, or
- Reduce DC, or
- Swap it for a Doom-flavored containment that still allows play:
  - “Containment Field (Recharge 5–6): target makes a save at end of each turn to escape,” etc.

---

## 5) Action economy & encounter flow

You’ve given Doom:
- strong **baseline action** (multiattack or spell),
- **3 legendary actions** (including spellcasting),
- a powerful **reaction** that competes with *shield/counterspell*,
- flight + teleport reposition.

That’s appropriate for a solo boss, but the *type* of economy matters: right now it leans toward **denial** (countering, forcecage, wall of force, double concentration) rather than interactive back-and-forth.

**Suggestion:** trade a little denial for more “fightable” offense:
- Keep one signature denial tool, but add one **Recharge AoE** attack that deals meaningful damage and creates tactical choices (e.g., “Doomsday Pulse” cone/line, half on save).
- Or give a legendary action that pressures without hard-locking (e.g., “Target must move / drop concentration / take damage”).

---

## 6) Theme & representation (what you nailed, and what you could add)

### Strong Doom theming already present
- Armor, force field, tech + sorcery, arrogance (“Kneel Before Doom”), high Int—great.
- The “Scientific Sorcery” concept is very on-brand; it just needs a limiter.

### The one thematic thing that’s missing: Doombots / misdirection
Doom is famous for decoys and layered contingencies. You can add that without bloating power too much:
- ***Doombot Contingency (1/Day).*** When Doom would drop to 0 hit points, he instead drops to 1 hit point and teleports up to 60 feet, leaving behind an inert Doombot shell (or illusion) that collapses.
- Or a reaction: “swap places with a Doombot within 30 ft.”

This increases “Doom-ness” more than raw numbers.

---

## 7) If your goal is specifically “CR 24”: a concrete tuning pass
If you want it to play like a hard-but-fair CR 24 solo, I’d recommend:

1. **Fix HP math** (315) and then **reduce defensive stacking**:
   - Force **immunity → resistance**
   - Personal Force Field temp HP: **20** (or 15) per turn
2. **Reduce DC/to-hit slightly**:
   - INT 30 → **INT 26–28** (DC **23–24**, spell attack **+15–16**)
3. **Nerf the two biggest lockdown mechanics**:
   - Limit **double concentration** (see options above)
   - Rewrite **Power Siphon** to limited-use counterspell variant (no contested check, capped slot refund)
4. **Fix Multiattack spell swap**:
   - Only swap for a **cantrip**, or remove the swap entirely

If instead your goal is “Doom as near-unstoppable endboss,” then keep most of it—but I’d label him closer to **CR 26–28** and expect the fight to be more puzzle/goal-based than a straight slugfest.

---

If you tell me what party level/composition you’re targeting (and whether “Technology” is a core skill in your setting), I can give a tighter CR estimate and propose an updated statblock pass that hits your intended difficulty.