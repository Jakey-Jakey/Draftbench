# gpt reviews gpt

## High-level take
This is a strong, flavorful “archvillain boss” chassis (high AC, strong saves, legendary actions, tech/magic blend). The two biggest balance pressures are:

1) **Durability stacking too efficiently** (HP + per-round temp HP + a large flat damage reduction reaction + Magic Resistance + Legendary Resistance).  
2) **Summon Doombots** as written can *explode the encounter difficulty* far beyond CR 23 because helmed horrors are tough and action-efficient in groups.

If you want this to play like a CR 23 solo boss against a level ~17–20 party, you’ll likely want to reduce one of those pressure points (or accept that the “true” encounter is closer to CR 25–27 when he uses his best options).

---

## CR & mechanical balance

### Defensive CR (likely too high for CR 23)
- **HP math is off:** 28d8 + 196 averages **322**, not 330. (28 × 4.5 = 126; 126 + 196 = 322)
- Baseline **322 HP** is roughly in the **CR ~20** HP band, *before* mitigation.
- Then you add, per round:
  - **Force Field Matrix:** +20 temp HP at start of each turn (effectively “regeneration” in many fights).
  - **Force Field Surge (LA):** can set temp HP to **40** every round (costs 2 LAs). Because temp HP doesn’t stack, Doom will prefer 40 most rounds.
  - **Redirective Shielding (reaction):** **reduce damage by 25** once per round.
  - Plus **Magic Resistance** and **Legendary Resistance (3/day)**, which massively suppress “save-or-suck” counterplay.

**Practical outcome:** many parties will feel like they’re chewing through a wall, and the fight risks becoming long/attritional unless they have very high sustained DPR *and* ways to deny reactions/legendary actions.

**Actionable fixes (pick 1–3):**
- **Reduce the flat reduction** on Redirective Shielding from **25 → 15–20**, *or* make it **PB/Day** rather than every round.
- **Nerf the temp HP engine:**
  - Force Field Matrix: **20 → 10–15** temp HP, *or* “only while above half HP,” *or* “if Doom has no temp HP, he gains 20.”
  - Force Field Surge (LA): **40 → 20–25** temp HP, and/or **(Costs 3 Actions)** so it competes with offense more meaningfully.
- If you keep both strong temp HP and the reaction reduction, consider **lowering base HP** (e.g. ~270–300) so the effective durability lands where you want.

### Offensive CR (around CR 23–25 depending on use)
Sustained “simple” DPR:
- Two **Gauntlet Blasts**: 2 × 33 = **66**
- Plus **Legendary Action Gauntlet Blast**: +33 = **99 DPR**
That’s right in the **CR 23 DPR band**. Attack bonus **+13** is also above the DMG expectation for CR 23 (typically +10), which effectively pushes offensive CR up a bit.

However, the block also contains **very swingy spell options**:
- **meteor swarm** can outright end encounters depending on positioning.
- **forcecage / maze / plane shift** can remove PCs from play (often “unfun loss of agency” rather than “hard but fair”).
- **Overclocked Casting (LA)** can add repeated *fireball/lightning bolt* pressure on top of the 99 DPR baseline.

**Actionable fixes (to keep CR 23 feel):**
- Tighten the “hard removal” spells:
  - Make **forcecage** and **plane shift** **1/day each** explicitly (even if he has slots).
  - Consider replacing one of them with something still Doom-y but less binary (e.g. *finger of death, chain lightning, prismatic spray, telekinesis* already present).
- Consider changing **Overclocked Casting** to “casts a spell of **2nd level or lower**” (still scary, less fight-warping), or make it **Recharge 5–6**.

---

## Summon Doombots: biggest gameplay/CR problem
**2d4 helmed horrors** (avg 5) is encounter-warping:
- That’s ~5 extra bodies with **AC 20**, **Magic Resistance**, strong immunities, and **multiattack**.
- You’re not just increasing difficulty—you’re changing the fight from “solo legendary boss” to “boss + elite squad,” which will overwhelm many parties and spike the effective encounter XP/CR dramatically.

**Actionable redesign options:**
1) **Keep helmed horror, reduce quantity drastically**
   - “Summons **1** helmed horror” (or **1d2**) is still scary and thematic.
2) **Use a weaker Doombot stat block**
   - Swap to **animated armor** (CR 1) or **flying sword** (CR 1/4) with Doom flavor.
   - Or create a custom **CR 2–3 Doombot** that has one cool tech feature but modest DPR/HP.
3) **Minion-style Doombots (recommended for table speed)**
   - Summon **6–10 minion Doombots** with **1 HP** each (or “die on any hit, take no damage on successful saves”), dealing small chip damage and providing battlefield clutter without turning into a second encounter.

Also consider adding: “Doom can have at most X Doombots summoned at once.”

---

## Action economy & turn feel
You’ve got:
- Full caster spell list (20th-level)
- Multiattack baseline
- 3 legendary actions/round
- A strong reaction
- Potentially 4–8 additional creatures acting every round

That’s **a lot**. Even if balanced numerically, it can bog down play and crowd out PC spotlight.

**Actionable streamlining:**
- If you keep Doombots, consider **removing one legendary action option** (commonly remove “Gauntlet Blast” LA) so Doom isn’t simultaneously a top-tier blaster *and* a commander.
- Alternatively, keep LAs but make Doombots **lair actions** (1/round, fixed number, simple statline) so you’re not running 5 separate CR 4 turns.

---

## Spellcasting list: strong but potentially unfun
The list is very “20th-level PC,” which is accurate but can create two issues:
1) **Bookkeeping/choice paralysis** for the DM.
2) **Binary lockdown** (*forcecage/maze/plane shift/time stop into setup*) that can delete a PC’s participation.

**Actionable improvements:**
- Convert to a **“signature suite”**:
  - At will: a few staples (*counterspell* often shouldn’t be at-will, but you can keep it as slots), *misty step*, *shield*, a blast
  - 3/day each: *wall of force, disintegrate, dominate person*
  - 1/day each: *time stop, meteor swarm, maze*
- Or keep slots but add a **“Tactics”** sidebar: what Doom typically concentrates on, his opening round, when he uses hard control, etc.

Also note: “requires no material components” is a big rules lever because it bypasses costly components (notably **forcecage** and **plane shift**). If that’s intentional, great—if not, change to:
- “He requires no material components **unless they have a gp cost**.”

---

## Formatting & 5e conventions (quick fixes)
- **Hit Points:** change to **322 (28d8 + 196)** *or* adjust dice/mod to actually average 330.
- **Arcana +20** doesn’t match the rest. With INT +6 and PB +7:
  - Normal proficiency would be **+13** (like History/Investigation).
  - **+20** implies **expertise** (double PB). Add a trait line like:
    - **Expertise.** Doom’s proficiency bonus is doubled for Arcana checks.
- **Languages line:** typically formatted like:  
  “Languages Common, Latverian, Draconic, Infernal; telepathy 120 ft.”
- **Recharge formatting:** you used “5–6” correctly; keep consistent punctuation throughout (5e tends to use en dashes).

---

## Theme & representation
This reads like Doom: armored sorcerer-scientist, force fields, energy blasts, teleporting, contingency planning, Doombots. Strong theme.

Two thematic tweaks that also improve gameplay:
- Consider giving him a **“Doombot Decoy” / “Master of Imposture”** defensive trick *instead of* some raw mitigation. Example: once per short rest, when hit, he swaps with an adjacent Doombot or creates an illusion causing the hit to miss. This keeps Doom slippery without making him purely a damage sponge.
- Make the tech feel mechanically distinct: e.g. Gauntlet Blast could apply a short “Systems Shock” rider (no reactions, -10 speed, etc.) rather than just more damage.

---

## Suggested “CR 23-targeted” adjustment package (one coherent proposal)
If you want this to land closer to CR 23 in real play **with Doombots included**, here’s a conservative set of edits:

1) **Force Field Matrix:** 20 temp HP → **15** temp HP.  
2) **Force Field Surge (LA):** 40 temp HP → **25** temp HP (Costs 2 Actions).  
3) **Redirective Shielding:** reduce damage by 25 → **15**.  
4) **Summon Doombots:** 2d4 helmed horrors → **1d2 helmed horrors** *or* **2d4 animated armors**.

If you apply only (1–3) and keep 2d4 helmed horrors, expect the encounter to play much higher than CR 23.

---

If you tell me whether you envision Doom as (A) a true solo boss, (B) boss-with-guards, or (C) a mythic two-phase fight, I can suggest a tighter rewrite that hits that specific play experience and a more precise recalculated CR.