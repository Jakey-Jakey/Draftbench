# gpt reviews gemini

## Formatting / rules-clarity fixes (5e conventions)

- **Creature type/casing:** Use `Medium humanoid (human), lawful evil` (lowercase subtype).
- **Skill math mismatch:** With PB +7 and Int +8, **Arcana should be +15**, not +22, unless you intend expertise.
  - **Actionable fix:** Add a trait like:
    - ***Expertise.*** Doom’s proficiency bonus is doubled for Arcana checks.
- **“Indomitable WIll” typo + vagueness:** Fix capitalization (“Will”) and tighten wording. “Effects that would alter his mind” is table-argument bait (does *hold person* count? *bane*?).
  - If the goal is “can’t be read / influenced,” use established language (see suggestions below).
- **Spell slots vs. prepared list clarity:**
  - You list **two 8th-level spells** but a 20th-level caster has **one 8th-level slot**. “mind blank (cast daily)” implies it’s pre-cast, which is fine, but write it explicitly.
  - **Actionable fix:** Move it out of the slot list:
    - ***Mind Blank (1/Day).*** Doom casts *mind blank* on himself, requiring no components.
    - Then list **8th level (1 slot): *power word stun***.
- **Legendary Action spellcasting needs a rules line:**
  - Specify **casting time 1 action** and whether he **expends slots**.
  - **Actionable fix:** “Doom casts a spell of 1st–3rd level from his list (casting time 1 action), expending a spell slot as normal.”

## Mechanical balance & CR accuracy

This statblock *plays* more like **CR 22–24** in practice, mainly due to **very high accuracy/DCs** plus **encounter-warping control**.

### Offensive output (big driver upward)
Baseline “damage turn” is usually:
- Action: **Multiattack (2 gauntlets)** = 38 avg
- Legendary actions: often **3× Gauntlet Blast** = +57 avg  
**Total ≈ 95 DPR** before any big spells. That DPR band is typically higher than CR 21 expectations, *and* it comes with **+15 to hit** and **DC 23** spell saves.

Also, Doom’s spell list contains multiple “one-save and you’re basically out” options (**forcecage, plane shift, power word stun**) with an unusually high DC. Even if DPR were lower, these push encounter lethality.

**If you want to keep CR 21:**
- Reduce repeatable DPR and/or accuracy:
  - Make **Gauntlet Blast cost 2 legendary actions**, or
  - Limit **Gauntlet Blast to 1/round**, or
  - Drop gauntlet damage to **2d10 + 5** (avg 16) and/or make Multiattack **only 1 gauntlet + 1 touch**.
- Consider nudging **DC down to 21–22** (e.g., Int 24 instead of 26) if you keep the hard-control kit.

**If you want to keep the kit as-written:**
- Re-label as **CR 23ish** and **increase HP** to match a “frontline archmage in power armor” (something like **300–340 HP** will make the defensive side feel consistent with the offensive threat).

### Defensive profile (already very strong)
AC 22 + *shield* access + Magic Resistance + Legendary Resistance + multiple resistances/immunities makes him extremely hard to pressure, especially for caster-heavy parties. This is not automatically “wrong” for Doom, but combined with his control suite it can become oppressive.

**Actionable levers:**
- If you keep AC 22, consider trimming **one** of the following:
  - remove **Magic Resistance**, *or*
  - reduce broad condition immunity (exhaustion is a notable outlier on a humanoid), *or*
  - remove an extra damage layer (e.g., drop elemental resistances or make them “adaptive”/limited).

## Action economy & encounter flow

- **Summon Doombot (1/Day)** is effectively adding a **CR 4 ally** to a legendary boss fight, which is a real difficulty bump. “Takes its turn immediately after his” is also a tempo spike.
  - **Actionable fix options:**
    1. Add **“Only one doombot at a time.”**
    2. Make the doombot act on Doom’s initiative but **only Dodges unless Doom spends a legendary action to command it**.
    3. Or summon it at **half HP** / with reduced offense (a “bodyguard” that’s more about soaking hits than adding DPR).

- **Multiattack includes Frightful Presence every turn.** That’s unusual and tends to frontload frustration rather than drama.
  - **Actionable fix:** Make it **Recharge 5–6** or **1/Day**, and remove it from Multiattack:
    - ***Multiattack.*** Doom makes two Arcane Gauntlet attacks.
    - ***Frightful Presence (Recharge 5–6).*** … (as written)

## Potential gameplay issues (and how to make them fun)

### 1) Vector Trap is encounter-breaking
Teleporting a PC **up to 1 mile** to a prepared prison/forcecage on a single failed save (with **no ongoing save**) can effectively delete a character from the session. It’s also extremely hard to adjudicate fairly mid-combat.

**Actionable redesigns that keep the “Doom tech trap” fantasy:**
- **Option A (combat-safe control):** short-range reposition + restraint
  - ***Vector Trap (Costs 3 Actions).*** DC 23 Cha save or be teleported to an unoccupied space Doom can see within 60 feet and **restrained** until the end of its next turn.
- **Option B (maze-like but still interactive):**
  - Fail = banished to a “trap pocket dimension”; **repeat save at end of each turn** to return (like *maze* pacing).
- **Option C (plot-device version):** keep the 1-mile prison teleport but make it **1/Day**, **requires Doom’s concentration**, and **ends if Doom is incapacitated**. That makes it a story tool without casually removing a player.

### 2) Plane Shift can also “remove a PC forever”
As a villain, Doom *would* do it, but at the table it can be a “failed save = new campaign” moment.

**Actionable fix:** Restrict offensively:
- “Doom can target only **willing creatures** with *plane shift*,” or
- Replace with *banishment* / *maze*-style effects for combat, keeping *plane shift* as an escape/plot spell.

### 3) Power Siphon can overly punish casters
Reaction *counterspell* plus healing encourages a play pattern where casters stop casting, which can feel bad.

**Actionable tweaks:**
- Limit healing to **once per round** (it already is via reaction), *and/or*
- Only heal when countering **a spell of 4th level or higher**, *and/or*
- Heal a flat amount (e.g., **15 + spell level×5**) so it’s less swingy.

## Thematic representation (what’s working + what to lean into)

What’s working:
- “Arcane Technology” + wizard spellcasting nails the **techno-sorcerer** identity.
- Doombot summon supports the **iconic redundancy/decoys** theme.
- High Int/Cha, fear, and battlefield control fit Doom.

Easy thematic upgrades that also improve play:
- **Add a “Doom cannot be easily read” trait using established language** rather than broad immunity:
  - ***Mind Shield.*** Doom is immune to any effect that would sense his emotions, read his thoughts, or determine whether he is lying. Divination spells reveal false information unless he allows them to function.
- **Add a “Calculated Defense” rider instead of blanket exhaustion immunity:**
  - Advantage on saves vs. exhaustion, or ignores the first level of exhaustion, etc.
- Consider a **mythic/phase change** (optional): at ~100 HP, armor protocols activate (temporary HP + new legendary action), which is very “Doom” and often more satisfying than simply inflating numbers.

## Small mechanical improvements (tight, actionable)
- Allow **Electrified Touch** to replace a gauntlet attack in Multiattack:
  - “Doom makes two attacks with his Arcane Gauntlets, or he makes one Arcane Gauntlet attack and one Electrified Touch attack.”
- Clarify **Arcane Gauntlets** as a device attack if you don’t want it shut down by antimagic the same way:
  - If you *do* want it magical, keep “Ranged Spell Attack.”
  - If you want “tech that still works,” make it a **Ranged Weapon Attack** that deals force/lightning and is “magical for overcoming resistance.”
- Clean up redundancy: if you keep *mind blank* always-on, you can likely drop **psychic immunity** *or* the “Indomitable Will” blanket statement (to avoid triple-stacking the same concept).

If you tell me your target experience (e.g., “CR 21 for a level 13 party” vs “endgame level 17–20 showdown in Castle Doom”), I can suggest a specific revised DPR/HP/DC package and a rewritten Vector Trap that hits the tone without deleting players.