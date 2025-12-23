# gpt reviews gpt

## High-level take
This is a strong, table-ready “endgame boss” chassis with good Doom flavor (armored arcane tyrant, technomagic, doombot trick). Mechanically it’s *a little overtuned offensively* for CR 23 if Doom leans into Multiattack + Legendary Actions, and there are a few 5e math/format inconsistencies that will matter at the table (notably the gauntlet attack bonus/damage and the Arcana skill).

---

## 1) Mechanical balance & CR accuracy

### Defensive CR (rough DMG read)
- **HP 315** puts him around **defensive CR ~21** (315 is right on that band).
- **AC 21** is about **+2 above** the “typical” AC for that CR range, which effectively nudges defensive CR up about **+1**.
- **Magic Resistance + Legendary Resistance (3/day)** are significant “real play” durability multipliers (they don’t cleanly enter DMG math, but they *absolutely* push boss survivability up).
- **Doombot Contingency (1/day)** is effectively an extra “mythic buffer” (not full mythic, but still denies the party’s first kill turn and adds a body).

**Result:** defensively he *plays* like **CR 23–24** even before considering defensive spell choices (*shield, mirror image, greater invisibility, globe of invulnerability, wall of force*).

### Offensive CR (where the spike is)
If Doom uses his kit aggressively, his single-target DPR can jump very high:

- **Multiattack:** 2× Arcane Gauntlet. (Listed as 35 each, but see math issue below.)
- **Legendary Actions:** up to **3× Gauntlet Strike** per round (105 listed damage), or other options.

If the gauntlet really is ~35/hit, a “default” round can be:
- **Action:** ~70
- **Legendary:** ~105  
= **~175 DPR** single-target *without spending spell slots.*

That DPR is more in the **CR 24–26** neighborhood depending on assumptions, and it’s before you factor in the control value of **push + prone on every hit** (which functionally adds damage via advantage, denial of movement, and burning actions to stand).

**Recommendation if you want CR 23 to be “honest”:**
Pick one (or combine small trims):
1. **Lower gauntlet damage** (or remove one damage rider).
2. **Limit the push+prone rider** to **1/turn** (or “Large or smaller,” or “once per target per turn”).
3. **Reduce legendary gauntlet frequency** (e.g., Gauntlet Strike costs **2** legendary actions, or he only has **2** legendary actions/round).
4. Keep damage but accept that he’s closer to **CR 24–25** in practice.

---

## 2) Accuracy / internal math issues (important to fix)

### Arcane Gauntlet: attack bonus & damage mismatch
- You list **+13 to hit**. With **PB +7**, that implies **+6 ability mod** (Int 22), not Str 18 (+4).
- But the damage includes **“+ 4”**, which implies Str.

**Fix options:**
- **Tech-gauntlet uses Intelligence:**  
  - Attack becomes **+13**, damage becomes **2d10 + 6 plus 4d8** (and update the average).
- **Armor uses Strength:**  
  - Attack becomes **+11** (PB 7 + Str 4), damage stays +4.

### Arcane Gauntlet average damage is off
- **2d10 + 4 + 4d8** averages **33**, not 35.  
  (2d10=11, +4 =15, 4d8=18 → total 33)

Not a huge deal, but it matters when you’re targeting a specific CR.

### Arcana +20 needs an explanation
With **Int +6** and **PB +7**, proficiency is **+13**. To reach **+20**, Doom needs **expertise/double proficiency** or a special feature.

Add a trait like:
- **Arcane Savant.** Doom’s proficiency bonus is doubled for **Arcana** checks.

---

## 3) Action economy & “feel” in play

### Legendary + Reaction suite is very oppressive (but close to working)
You’ve given Doom:
- 3 Legendary Actions/round
- A strong defensive Reaction (**Arcane Deflection**)
- 3/day free **counterspell** (at 5th)
- Bonus action teleports (and legendary teleport)

This makes him extremely hard to “pin” and very hard to land key spells on—good for Doom—but it risks a play pattern where:
- Casters feel shut down (counterspell + magic resistance + legendary resistance)
- Martials struggle to stick to him (teleport, push/prone, defensive reaction)

**Softening suggestions without losing the fantasy:**
- Make **Runic Counterspell** either:
  - **2/day**, or
  - require Doom to **see the caster** and **not be incapacitated** (standard), and/or
  - treat it as a **4th-level slot** instead of 5th (still scary).
- Consider making **Arcane Deflection** choose **either** AC boost **or** damage reduction, not both. (Both is strong, especially on top of *shield* being available.)

### Push + prone on every hit can become repetitive/unfun
It’s strong control and also slows combat due to constant repositioning and stand-up decisions.

Common boss-design limiter:
- “The target must succeed… or be pushed… and knocked prone. **A creature can be affected by this rider only once per turn.**”
- Also consider a **size limit** (Large or smaller) unless you explicitly want Doom bowling over dragons and titans.

---

## 4) Spellcasting choices: theme vs gameplay problems

### Theme: mostly on point, but a few picks are “wizard generic”
Doom reads as “armored archmage” well. If you want *more Doom specifically*, consider swapping a couple spells for:
- **contingency** (very Doom, and you already like contingencies)
- **symbol** (Latverian castle horror)
- **animate objects** / **summon construct** (doombot vibe)
- **blade ward** (if leaning “armor magic”), **wall of iron** (techno-arcane)
- **modify memory** (tyrant manipulation)

### Gameplay red flags: *forcecage*, *maze*, *time stop*
These are iconic high-level wizard tools, but they can reduce player agency sharply:
- **Maze** can sideline one PC for multiple rounds with little interaction.
- **Forcecage** can hard-remove a PC unless the party has very specific answers.
- **Time stop** is fine, but it can lead to “GM solitaire” if Doom uses it to stack multiple no-save setups.

If you keep them (totally valid for CR 23+), I’d recommend adding an *encounter intention* note for yourself, like:
- Doom uses **time stop** primarily to reposition, raise defenses, and deploy doombots—not to lock one PC out of the fight for 10 minutes.

---

## 5) 5e formatting & clarity improvements

- **Initiative:** You say Int to initiative is “included,” but initiative isn’t listed. Either remove that parenthetical or add **Initiative +?** (if using a newer-style presentation).
- **Arcane Power Armor (material components):** “requires no material components” should usually be:  
  **“He ignores material components that lack a gold cost and aren’t consumed.”**  
  Otherwise he can cast things that normally require expensive components for free.
- **Doombot Contingency:** Clarify how the helmed horror enters combat:
  - Does it roll initiative, or act immediately after Doom, or on Doom’s initiative?
- **Arcane Gauntlet:** Decide whether it’s a **weapon attack** or a **spell attack** in fiction/mechanics. If it’s tech/magic, “weapon attack” is fine, but then clarify if it counts as **magical** (it probably should).

---

## 6) Thematic representation (Doom-ness)
What you nailed:
- Armor as life support + focus
- Monarch fear aura
- Doombot misdirection
- Wizard-grade control magic

What’s missing if you want *peak Doom*:
- Some expression of **commanding minions** (even a limited “Summon Doombots” recharge power or lair action).
- A **“I planned for this”** tactical trait that isn’t just more defense—e.g., a once/round forced reroll against him, or the ability to **swap positions with a doombot** within range.
- Something that makes him feel like a **ruler** (not just a wizard in armor): a “Kneel” command, an aura that punishes attacks against allies, etc.

---

## Suggested quick patch list (minimal edits, big payoff)
1. **Fix gauntlet math** (choose Int or Str; fix average damage).
2. Add **Arcana expertise** trait (or lower Arcana bonus).
3. Limit **push+prone rider** to **1/turn** (and consider size limit).
4. Decide whether you want him to be **CR 23** or **CR 24–25**:
   - If CR 23, trim either gauntlet damage or legendary gauntlet throughput.
5. Make **Arcane Deflection** “AC or DR” (not both) *or* reduce the DR.

---

If you share your intended party level/size and how “comic-book lethal” you want him to feel (e.g., fair-but-deadly vs. oppressive mastermind), I can give a more precise CR recalibration and recommend an optimized “3-round script” that showcases Doom without removing player agency. Also happy to review the lair package if you post it.