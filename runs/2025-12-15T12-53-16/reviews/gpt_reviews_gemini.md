# gpt reviews gemini

## High-level read
You’ve captured the *idea* of Doom extremely well: armored tyrant, top-tier intellect, real spell power, and paranoia (Doombots). Mechanically, though, the current package stacks so many “nope” defenses and so much high-accuracy output that it will often play less like a climactic duel and more like an attrition wall that also deletes a PC every round. In DMG terms, it’s closer to **CR 26–28** in practice unless you rein in a few specific pressure points.

Below is feedback by category, with concrete, 5e-native fixes.

---

## 1) CR accuracy (DMG math + practical table reality)

### Defensive CR (too high for 24 as written)
- **HP 333** is in the CR 21-ish band, *but* your effective durability is much higher because of:
  - **AC 22** (already +3 over the DMG “typical” AC for that HP band).
  - **Magic Resistance + advantage on all mental saves + 4 Legendary Resistances**: this makes control/disable strategies (the main way high-level parties beat solo bosses) dramatically less effective.
  - **At-will *shield*** (see formatting issue below) functionally pushes AC to **27** most rounds if you let him use it freely.
  - **Techno-Magical Absorption** can nullify a huge portion of incoming burst (and heal), further inflating effective HP.
  - **Doombot Protocol** is effectively a **mythic second bar** ~50% of the time.

**Result:** Even if you don’t formally multiply HP for resistances (since tier-4 parties are often magical), the *stacked denial* pushes this into “mythic boss” territory. Defensive CR will commonly *play* around **26+**.

### Offensive CR (also high for 24)
Baseline single-target routine:
- Multiattack (2 gauntlets): **~62 DPR**
- Plus 1 legendary **Gauntlet Blast** most rounds: **+31 DPR**
- That’s **~93 DPR** before AoE, paralysis, or spell substitutions.

But he can spike far above that:
- If he swaps in **Disintegrate** (avg 75 on failed save) while still making a gauntlet attack, plus a legendary gauntlet: you can see **130–160+ “effective DPR”** depending on saves/accuracy.
- **Attack bonus +17 / save DC 25** is *extremely* high; Doom will almost never miss and PCs will fail a lot.

**Result:** Offensive CR trends **26–28** depending on spell choices.

**Conclusion:** As written, Doom is very likely **under-labeled at CR 24**. Either adjust down to truly be 24, or keep the power and call him **CR 26–28** (or explicitly “CR 24, mythic”).

---

## 2) Action economy & encounter pacing (biggest gameplay risk)
You’ve given Doom:
- Full actions + **3 legendary actions**
- A strong **reaction** (plus you also list reaction spells like *shield/counterspell*)
- **1/day minion summon** that can add 1–4 additional turns per round
- Optional **lair actions**
- A **potential second phase**

That is *a lot* of turns and denial layered onto a solo. The risk is not “too hard,” it’s **too many sources of control and negation**, producing a fight where players feel their choices don’t matter.

**Specific pressure points**
- **Summon Doombots** using *helmed horror* (already a very durable statblock) + flight + *eldritch blast* adds a large, swingy difficulty spike. If he rolls 4, the encounter can jump from “boss fight” to “boss + four mini-bosses.”
- **Kneel Before Doom** is effectively a **multi-target turn-ender** (functionally a mass stun) on a **DC 25** Wisdom save and can be repeated every round (2 legendary actions is not a big price for a turn delete).

**Fixes that preserve theme**
- Make Doombots **weaker but more numerous**, or **strong but capped**:
  - Example: “Summon 2 Doombots” (fixed number), or “summon 1d4, but they have 45 hp and AC 17,” etc.
- Rework **Kneel Before Doom** so it’s not a repeatable mass turn deletion:
  - Target **one creature** (or up to two).
  - Or: on a fail they fall prone and are **frightened** until end of next turn (no “end their turn”).
  - Or: creatures that succeed are **immune for 24 hours** (standard 5e pattern).

---

## 3) Defensive mechanics (stacking “unfun” immunity layers)
### “Indomitable Ego” + “Magic Resistance” + 4 LR
Advantage on all Int/Wis/Cha saves plus Magic Resistance is already oppressive; adding **4** legendary resistances on top makes most casters’ turns irrelevant.

**Suggestion**
- Choose *two* of these three pillars:
  1) Magic Resistance  
  2) Indomitable Ego (advantage on mental saves)  
  3) Legendary Resistance  
- And set **Legendary Resistance to 3/day** unless you have a strong reason for 4.

A very Doom-feeling alternative:
- Keep **Legendary Resistance (3/day)**
- Replace Indomitable Ego with something narrower, like:
  - “Doom has advantage on saving throws against being charmed, frightened, or possessed,”
  - or “against spells of 6th level or lower.”

### Techno-Magical Absorption (too absolute)
“As a reaction: take **no damage** and heal for half” is encounter-warping. It can erase a meteor swarm, disintegrate, smite spell, etc., and it’s not limited per day.

**Make it strong, but bounded**
Pick one:
- **Recharge 5–6**, or **3/day**, or
- Reduce damage instead of nullifying:
  - “Reduce the damage by 50 (or 10d10), and heal the amount reduced.”
- Constrain the trigger:
  - “When Doom takes **lightning, force, or radiant** damage from a spell…”

This keeps the “armor drinks energy” fantasy without invalidating blasters.

### Scientific Sorcery vs *antimagic field*
“Ignore antimagic field unless it also suppresses tech items” will create rules arguments at many tables because “technology” isn’t a core 5e rules category.

**Cleaner 5e-native approach**
- Decide what is magic and what is tech:
  - If his spells are spells, *antimagic field* should suppress them.
  - If his armor has tech effects, express those as **nonmagical** features (force bolts, flight, etc.).
- Or give him a limited bypass:
  - “1/day, Doom can cast spells while in antimagic field until the end of his turn.”

---

## 4) Spellcasting package (power + formatting issues)
### Major 5e convention issue: casting times
You list *shield*, *misty step*, and *counterspell* under “Spellcasting” as an action option, but those are **reaction/bonus action** spells. In 5e, monsters must follow casting times unless you explicitly change them.

**Fix**
- Put spellcasting as a **trait** (“Spellcasting.”) and then in Actions have **“Cast a Spell.”**
- Add a **Bonus Actions** section for *misty step* (if you want him using it).
- Keep *shield/counterspell* in **Reactions** (or in the trait but understood they use reactions).

### At-will *counterspell* and at-will 5th-level *lightning bolt*
- At-will *counterspell* with **DC 25** turns many encounters into “martials only.”
- At-will **5th-level** *lightning bolt* is very high sustained AoE DPR and can erase mid-HP PCs quickly.

**Suggestion**
- Make *counterspell* **3/day** (or proficiency bonus/day).
- Make *lightning bolt* at-will at **3rd level**, and 5th-level **3/day**.
- Consider giving him **cantrips** for at-will pressure (ray of frost, fire bolt, etc.) and keeping the big spells limited.

### “Absolute Power” (regaining 3/day slots)
This is a cool Doom mechanic, but it can spiral if it effectively means “infinite *disintegrate* until the party dies.”

**Suggestion**
- Limit it: “Doom regains one expended use of a 3/day spell. He can’t use this legendary action again until the start of his next turn.” (prevents chaining)
- Or: “He regains a use of *telekinesis* or *wall of force* only” (more tactical, less delete-button).

---

## 5) Control effects that may hard-lock PCs
### Molecular Disruption: paralyzed in a 60-foot cone
Damage + **paralysis** is brutal, especially at **DC 25**, and on a large AoE. Even “until end of its next turn” can still mean a PC loses a full round and eats crit-fishing.

**Tuning knobs**
- Keep the cone and damage, but downgrade the condition:
  - **Restrained** (still strong), or
  - **Stunned** but only on targets that fail by 5+, or
  - Paralyzed but allow a **repeat save at end of turn**.
- Or shrink area to **30-foot cone**.

### Kneel Before Doom: “end their turn”
This is effectively “no save, no play” if spammed.

**Safer rewrite**
- “Each creature of Doom’s choice within 30 feet must succeed on a Wisdom save or fall prone and be **frightened** until the end of its next turn.”  
(Still very Doom. Much less hard-lock.)

---

## 6) Doombot Protocol (theme is great; mechanics need clarity)
This is essentially a mythic trait (second phase), but:
- The **11+ roll** introduces swing that can undercut the climax.
- “Cannot function if Doom is incapacitated” conflicts with the fact that a creature at 0 hp is typically unconscious/incapacitated—wording needs to be very precise.
- The “DM’s discretion” teleport distance is narratively nice but mechanically fuzzy.

**Recommendation**
Make it a clean **Mythic Trait (1/Day)** style feature (Theros style):
- “When Doom is reduced to 0 hit points, he doesn’t die. Instead… (explosion)… Doom returns with X hit points and gains Y benefit.”
- If you want the paranoia angle, make it **not random**: either it’s a Doombot (phase 2), or it’s not (he dies/escapes). Randomness often feels like the DM “got lucky.”

Also: consider whether *dispel magic* should interact at all. 9th-level *dispel magic* is already an edge case and can feel like a “gotcha.”

---

## 7) Thematic representation (very strong, a few easy wins)
What you nailed:
- Armored sorcerer-scientist blend
- Doombots as paranoia/contingency
- Wall of force / time stop tactical tyranny vibes
- Flight + battlefield control to force “kneel” moments

What you could add (optional, but very Doom):
- A **Sovereign’s Aura**: allies (Doombots) within 30 ft gain +2 to AC/saves, or enemies have disadvantage on saves vs being frightened/charmed by him. Helps theme without raw damage.
- A clear **weak point** hook: e.g., “If Doom takes thunder damage, his AC is reduced by 2 until end of his next turn” (EMP fantasy), or “A creature adjacent can use an action and DC 25 Arcana/Thieves’ Tools to disrupt armor, suppressing Absorption until next round.” This gives players an objective besides “burn 333 hp.”

---

## 8) 5e formatting & rules-convention notes
- **Spellcasting should be a trait**, not an action list that ignores casting times. Add Bonus Actions/Reactions sections as needed.
- **Technology** skill isn’t standard 5e. If you’re not using a modern/expanded ruleset, consider:
  - Replace with **Investigation** and relevant **tool proficiencies** (tinker’s tools, smith’s tools).
- **Damage resistances**: “B/P/S from nonmagical attacks” is fine, but at CR 24 it often does nothing. If you want armor feel, consider instead:
  - flat reduction (“Doom reduces all weapon damage by 5”) or
  - resistance to **magical** B/P/S (very strong—use cautiously).
- **Arcane Gauntlet**: because it’s a “spell attack,” it interacts oddly with some features. If you intend it as tech + magic, you can make it a **melee/ranged weapon attack** that deals force/lightning.

---

## Practical “bring it to CR 24” adjustment bundle (minimal changes)
If your goal is to keep the concept but land closer to CR 24 and reduce frustration:

1) **Legendary Resistance 3/day** (not 4).  
2) Remove either **Magic Resistance** *or* **Indomitable Ego** (keep one).  
3) **Techno-Magical Absorption** becomes **3/day** *or* “reduce damage by 50; heal damage reduced.”  
4) Fix spellcasting timing; make:
   - *counterspell* **3/day**
   - *shield* **3/day**
   - at-will *lightning bolt* becomes **3rd level**, and 5th-level is **3/day**
5) Rework **Kneel Before Doom** to not end turns (or add immunity on success).  
6) Make Doombot Protocol a **mythic 1/day** option (no random roll), and if you use it, consider labeling the statblock as **Mythic Encounter** (effectively higher than CR 24).

---

If you tell me what your expected party looks like (size, optimization level, access to flight/counterspell, and whether you’re using magic items heavily), I can give a tighter CR estimate and propose a “Doom Phase 1 / Doom Prime Phase 2” rewrite that preserves your signature mechanics while making the fight interactive rather than purely oppressive.