# gpt reviews claude

## High-impact issues to fix first (rules clarity + balance)
1. **Proficiency Bonus / math mismatch.** Almost every derived number is built as if Doom’s **PB is +7**, not +8.
   - With **CR 25, PB must be +8**. That means (at minimum):
     - Spell save DC should be **25** (8 + PB 8 + Int 9), not 24  
     - Spell attack should be **+17**, not +16  
     - Gauntlet Strike to-hit should be **+13** (Str 5 + PB 8), not +12  
     - Saves/skills likewise should mostly be **+1 higher** than listed (if proficient).
   - **Actionable fix:** Either (A) change **CR to 24 (PB +7)** to match the current math, *or* (B) keep **CR 25** and update all bonuses/DCs accordingly.

2. **Doombot Contingency is swingy and can feel like a “gotcha.”** A 33% chance to “actually be a doombot” after the party wins is emotionally rough and wildly changes encounter length/difficulty.
   - **Actionable fixes (pick one):**
     - **Telegraph + choose:** “If Doom is a doombot, characters can discover it with X (Investigation/Arcana) before the fight; otherwise the DM decides, no die roll.”
     - **Make it mythic instead of random:** “When reduced to 0 hp, Doom instead activates a hidden reserve (mythic trait) and returns with **150 hp** and refreshed legendary resistances” (or similar).
     - **Reduce the reset:** If you keep the die roll, have “true Doom appears with **half** hit points” (or loses spell slots/legendary resistances).

3. **Summons will blow the encounter past CR 25.**  
   “Summon Doombots (1d4+1)” (avg 3–4 CR 7 creatures) plus lair-action spawning is encounter-warping. Even if Doom’s personal CR were accurate, the *fight* becomes far beyond it.
   - **Actionable fixes:**
     - Cap summons at **2 doombots**, or summon **1 doombot per use** (recharge 6) instead of a pile at once.
     - Make doombots **minions** (1 hp, no self-destruct, fixed damage) to add Doom flavor without quadrupling the initiative count and DPR.
     - If you want “army Doom,” then **lower Doom’s personal stats/defenses** and treat it as a **multi-monster boss encounter** rather than “CR 25 Doom.”

---

## CR accuracy (what this plays like)
### Defensive side
- **HP 337** is around **defensive CR ~22** before traits.
- But Doom stacks:
  - Multiple common resistances (cold/fire/lightning/thunder)
  - **Magic Resistance**
  - **Legendary Resistance (3/day)**
  - **Force Field reaction (+5 AC or +5 save)** (functionally “shield + indomitable” every round)
  - **Energy Shield (resistance to all damage)** for 3 rounds/day

In play, these layers push survivability way above what the raw HP suggests—often closer to a **CR 27–30 style boss** unless the party has very optimized counters.

**Actionable tuning (if you want true CR ~25):**
- Replace **Energy Shield (resistance to all damage)** with something less swingy, e.g.:
  - “Gain **40 temporary hit points**” (bonus action, 3/day), or
  - “Reduce damage taken by **30** (reaction, 3/day)” (feels like a force-field without invalidating entire turns).
- Limit **Force Field** to **PB/day** or **3/day**, *or* make it work only vs **attacks** (not failed saves), *or* require seeing the source.
- Consider trimming resistances to the most thematic 2 (often **fire + lightning**) instead of four.

### Offensive side
Baseline round looks like:
- Multiattack (3 attacks): often **~81 DPR** (3× Plasma Bolt) before accuracy
- Legendary Actions: **Plasma Volley** adds **~54 DPR**
- Reaction: **Retributive Strike** can add **~22 DPR**/round when used

That’s **~135 DPR** without reaction, **~157 DPR** with it—before Doom Blast, big spells, or battlefield control.

**Actionable tuning (to keep damage in CR 25 territory):**
- Keep the strong damage, but reduce the “always-on extra”:
  - Make **Retributive Strike** **Recharge 5–6** or **3/day**, or trigger only on **melee hits**.
  - Or reduce Plasma Bolt damage slightly (e.g. **3d10+9** instead of 4d8+9) if you keep the reaction damage.

---

## Action economy & gameplay flow
You’ve given Doom:
- Multiattack damage routine
- Full wizard casting (including fight-ending control)
- Bonus action teleport
- Bonus action analyze
- Two strong reactions plus *counterspell*/*shield* competing for the same reaction
- 3 legendary actions
- Lair actions
- Summons

This is thematically appropriate for Doom, but it’s **a lot to run** and can create “DM plays solitaire.”

**Actionable streamlining (keeps power, improves playability):**
- **Restrict Supreme Intellect** to **once per round** (or “only one creature analyzed at a time”). As written, legendary “Analyze” can mark multiple PCs, multiplying the disadvantage-on-saves pressure.
- Consider **removing shield from the spell list** if Force Field stays (or vice versa). Right now you have redundant defensive reactions that also compete with counterspell.
- Decide what Doom’s “default turn” is:
  - If he’s primarily a **blaster/bruiser**, keep Multiattack and reduce spell list to “signature spells.”
  - If he’s primarily a **spell tyrant**, reduce Multiattack to 2 attacks or make Plasma Bolt a cantrip-like fallback.

---

## Thematic representation (what’s working + what to add)
**What’s strong already:**
- High Int/Cha, armored flight/hover, doombots, technomagic blasting, lair control—this reads like Doom.

**Places to push theme harder (actionable):**
- Doom is iconic for **control, arrogance, and preparation** more than raw “big cone damage.”
  - Swap or reframe **Doom Blast** into something that enforces his dominance (e.g., a **line** that also **restrains/pushes** with magnetic force, or a cone that creates a **hazard zone**).
- Add a “ruler/commander” hook:
  - Example trait: **Imperious Command.** “A doombot within 60 ft can use its reaction to take an attack when Doom hits with Plasma Bolt” (careful—this increases DPR; use sparingly).
- Add an exploitable flaw for fair play:
  - Example: **Arrogant Monologue.** “The first time Doom drops a creature to 0 hp, he must spend a legendary action to gloat (or loses a legendary action next round).” This makes him feel like Doom and gives players counterplay.

---

## 5e formatting / rules clarity notes
- **Doom Armor**: “his AC includes his Intelligence modifier” is ambiguous because the AC line doesn’t show the formula.
  - **Actionable fix:** Write something like: “While wearing the Doom Armor, Doom’s AC is **18 + his Dexterity modifier (max 2) + his Intelligence modifier** (included in AC).” (Or whatever formula you intend.)
- **Spellcasting prepared list** is very long for at-table monster use. Not “illegal,” but harder to run.
  - **Actionable fix:** Convert to the newer monster style: **At will / 3/day / 1/day** plus a few slots, or just cut to ~10–14 signature spells you expect to cast.
- **Indomitable Will** currently clashes with immunities:
  - If Doom is **immune to charmed/frightened**, he usually won’t “succeed on a saving throw” against them.
  - **Actionable fix:** Change trigger to: “When a creature attempts to charm/frighten/read/control Doom, that creature takes 14 psychic damage (no action).”
- **Lair action DCs** (18) are far below Doom’s DC (24/25). That will make lair actions feel irrelevant at this tier.
  - **Actionable fix:** Set lair DC to **match Doom’s spell DC** (or at least ~22).

---

## Doombot review (CR + usability)
- **CR 7 feels high** for 85 hp / AC 17 unless you’re valuing flight + immunities + shield spam heavily. Offense is decent (36 DPR melee), but defense is closer to CR ~5–6 in many parties.
- **Innate shield needs a timing hook.**
  - Many tables miss that innate spells can be reactions.
  - **Actionable fix:** Add a Reaction entry: “**Shield (3/Day).** The doombot casts *shield* when hit by an attack…”
- **False Appearance**: “indistinguishable from Doctor Doom” is fun, but also implies voice/mannerisms/scale/gear-perfect mimicry.
  - **Actionable fix:** Tighten wording: “indistinguishable from **a humanoid in Doom armor**” or require a check (e.g., Investigation DC 17) on close inspection.

---

## Suggested direction choices (pick the experience you want)
1. **“CR 25 single boss” Doom:**  
   Reduce summons heavily, cap defensive layering (Energy Shield/Force Field), keep control spells + legendary actions.
2. **“CR 27–29 mythic Doom” Doom:**  
   Keep most defenses, but formalize a second phase (mythic trait) instead of random Doombot Contingency, and treat doombots as minions.
3. **“Castle Doom war encounter” Doom:**  
   Keep doombot production and lair spawns, but lower Doom’s personal durability/damage and run it as a set-piece battle with multiple objectives.

If you tell me which of those three encounter styles you’re aiming for (and typical party level/gear), I can propose a revised statblock targeting that exact difficulty and table feel.