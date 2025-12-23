# gpt reviews gpt

## High-level read
This is a very complete “final boss” build: strong defenses, strong control, strong mobility, and a mythic phase plus lair support. Theme is on-point (armored technomage tyrant). The main risk is **stacked defenses + very high DCs + hard control** producing either (a) an unwinnable lockdown or (b) a long slog where the party feels like their turns don’t matter.

Below is feedback by category, with concrete fixes.

---

## 1) CR accuracy & mechanical balance

### Defensive CR (as played)
- **HP 345** is in the CR ~20 band by DMG table, *before* traits.
- But Doom stacks multiple “effective HP” multipliers:
  - **5 energy resistances** (acid/cold/fire/lightning/necrotic) and **poison immunity**.
  - **Magic Resistance** (advantage vs many disabling effects).
  - **Legendary Resistance (3/day)** (effectively blanks the party’s best spells 3 times).
  - **Arcane Armor crit negation** (reduces spike damage significantly at tier 4).
  - **Reactive Forcefield (–30 damage) (Recharge 4–6)** (often ~15–30 damage prevented per round in practice, depending on recharge luck and how many hits come in).

In play, those traits push him well above what **345 HP** suggests—especially against parties leaning on elemental damage, save-or-suck spells, crit fishing, or big single hits.

**Mythic Trait** effectively adds another **200 HP** plus action economy upgrades, which makes the whole encounter feel like **two bosses back-to-back** (which is fine, but it’s no longer a “normal CR 23” experience).

### Offensive CR (as played)
Baseline damage pattern if Doom leans into his best repeatables:
- **Multiattack (3 Mystic Bolts)**: 3 × 33 = **99 DPR**
- Typical legendary usage will often include **Mystic Bolt (33)** once/round → **~132 DPR** sustained before recharge abilities/spells.
- **Unibeam** (72 in a line) spikes hard on recharge turns.
- In lair, **Automated Batteries** can add up to **63 DPR** (21×3) on initiative 20.

DMG offensive benchmarks for CR 23-ish assume roughly **~120 DPR** and **lower DCs** than you’re using. Your **save DC 22** and **+14 to hit** are noticeably above the DMG expectations for CR 23, meaning Doom lands effects more reliably than his “CR label” implies.

**Net:** As written, he *plays* closer to **CR 25-ish** (and even higher in lair, depending on lair action selection), *especially* because his control suite includes encounter-warping options (see gameplay issues).

### Actionable CR tuning options
Pick one of these design goals:

**Option A: Keep CR 23 as labeled (recommended if you want a fair level 17–20 boss).**
- Reduce sustained DPR a bit *or* reduce accuracy/DCs:
  - **Mystic Bolt**: drop to **5d10 (27)** or keep 6d10 but make Multiattack **2 attacks** instead of 3.
  - Lower **spell save DC to 20–21** (e.g., INT 22 or DC fixed at 21).
  - Lower **to-hit** on Mystic Bolt to **+12/+13**.
- Soften defenses slightly (to avoid a slog):
  - Change **Reactive Forcefield** to **reduce by 20** (or keep 30 but make it **1/round, no recharge** and remove the teleport rider, or vice versa).
  - Consider removing either **crit negation** *or* **Magic Resistance** (keeping both plus LR plus –30 reduction is a lot).

**Option B: Keep the numbers, change the label.**
- Re-label as **CR 25** (and adjust XP accordingly), and keep the mythic “double XP” approach consistent with that tier.

---

## 2) Gameplay issues (the big ones)

### A) “No-fun” lockdown combos
Doom has access to several effects that can shut down PCs with minimal counterplay:
- **forcecage** (no save; ends encounters for many parties)
- **antimagic field** (can blank multiple PC builds)
- **time stop** (lets him pre-stack defenses/control with little interaction)
- plus **wall of force**, **dominate person**, **banishment**, **telekinesis**

Individually these are fine for a CR 23+ archvillain; collectively, with **DC 22**, **Magic Resistance**, and **Legendary Resistance**, you risk creating a fight where the party’s best answers don’t work and Doom’s best tools always do.

**Actionable fixes (choose 1–2):**
- Restrict the “encounter-warpers” to **1/day each** and/or **mythic phase only** (common boss design pattern).
- Replace **forcecage** with a strong-but-interactive alternative (e.g., *maze* has a save/escape loop; *reverse gravity* is dramatic and tactical).
- Make **time stop** a **mythic-only opener** or replace it with something more table-friendly (e.g., *globe of invulnerability* as a signature “Doom barrier” moment).

### B) Reaction overload (Shield vs Forcefield)
You list **shield** and **absorb elements**, but Doom’s reaction is already heavily spoken for by **Reactive Forcefield** (and Counterspell is also competing for reaction economy).

**Actionable fix:**
- Either remove **shield/absorb elements** from the list (cleaner), or explicitly note: *“Doom typically uses Reactive Forcefield instead of shield.”*  
- Alternatively, change Forcefield to trigger on **attack hits** (like Defensive Duelist style) so *shield* remains relevant—right now Forcefield is usually superior.

### C) Construct control vs charm immunity
**Master of Machines** says the construct is “charmed.” Most constructs are **immune to charmed**.

**Actionable fix (wording):**
- “The construct is magically dominated by Doom… (this effect works even if the target is immune to being charmed).”
- Or remove “charmed” entirely and just state it is “controlled” and “can’t target Doom.”

---

## 3) Action economy & pacing

### What works
- **Legendary actions** are well-structured and support mobility + pressure.
- Mythic phase increasing to **4 legendary actions** is a good “phase 2 escalation” knob.
- **Bonus action reposition** + legendary movement fits the “armored jet mage” fantasy.

### What may feel excessive
- Doom can kite extremely well: **fly 30**, **Repulsor Dash**, **Repulsor Step (legendary)**, plus teleport from Forcefield if it zeroes damage. This can make melee PCs feel perpetually out of position.
  
**Actionable fixes:**
- Consider making **Repulsor Dash** either:
  - usable **only while flying**, or
  - usable **PB/day**, or
  - remove Dash and keep only the legendary move (so movement still costs a scarce resource).

### Legendary action menu
“**Command the Arsenal**” (2 actions) letting him cast a **3rd-level spell** as a legendary action is strong but reasonable. Just be mindful that it increases the likelihood of **Counterspell wars** and table slowdown.

**Actionable improvement:** Narrow the legendary-cast list to a few “signature” spells to speed turns (e.g., *counterspell*, *dispel magic*, *fireball/lightning bolt*).

---

## 4) Thematic representation
Theme is strong: armored ruler, sorcery + tech, domination of constructs, big beam, lair tech.

A couple theme-forward additions that also improve play:
- Add a short **Tactics** note (even 3 bullets) so DMs don’t default to “forcecage + time stop” every time.
- Consider a **Doombot / Decoy** element if you want classic Doom trickery (even as a lair action or a mythic action), which can replace some of the more oppressive spell picks while staying iconic.

---

## 5) 5e formatting & rules clarity fixes

### Spellcasting block
This is close, but for 5e convention and clarity:
- Use: “Doom is a 20th-level spellcaster. His spellcasting ability is Intelligence (spell save DC 22, +14 to hit with spell attacks). **He has the following wizard spells prepared:**”
- Consider listing reaction spells with a note: “**Reactions:** *shield, absorb elements*” (if you keep them).

### Movement
- If you intend stable flight, add **(hover)** to fly speed.

### Arcane Armor wording
- “can’t be disarmed of it” is awkward in 5e terms (armor isn’t disarmed).
  - Suggested: “The armor can’t be removed from Doom against his will.”

### Recharge clarity
- **Reactive Forcefield (Recharge 4–6)**: clarify whether it triggers per *instance* of damage (it should).
  - Suggested: “When Doom takes damage from a single source, he reduces that damage by 30…”

### Grapple/restraint stacking (Iron Grip)
As written, Iron Grip can make a target **grappled and restrained** off a single legendary action (plus prone from Gauntlet Strike on Doom’s turn). That’s very punishing.

**Actionable fix:** Remove one layer:
- Either make it “grappled (escape DC 21)” (no restrained), **or**
- keep restrained but remove the prone rider from Gauntlet Strike, **or**
- make Iron Grip cost **3 actions** in mythic phase only.

---

## 6) Lair actions
They’re flavorful. The main outlier is **Null-Magic Surge**:
- Automatically ending a **5th-level or lower** spell with **no check** is effectively a “no-roll dispel” that can repeatedly delete player turns/resources.

**Actionable adjustments:**
- Make it emulate *dispel magic*: “Doom makes an Intelligence check (+14) against DC 10 + the spell’s level.” (Still very strong.)
- Or limit it to **3rd level or lower** automatically, and require a check for higher.

---

## Suggested “quick patch” to keep the feel but improve play
If you want the least editing with the biggest play improvement while keeping CR 23:
1) Reduce **Mystic Bolt** to **5d10** *or* reduce Multiattack to **2 attacks**.  
2) Drop **DCs to 21** (or reduce INT by 2).  
3) Fix **Master of Machines** to bypass charm immunity (wording).  
4) Restrict **forcecage/time stop/antimagic field** to **mythic phase only** (or 1/day each).

That keeps Doom terrifying and iconic without turning the fight into either a lockdown or a grind.

If you tell me the intended party level/composition (and whether this is meant to be “deadly but fair” vs “near-hopeless cinematic”), I can recommend a tighter CR target and a trimmed spell suite that preserves his identity.