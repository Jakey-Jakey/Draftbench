# gpt reviews gemini

## High-level read
This statblock captures “tech + sorcery tyrant” well, but as written it will play **more oppressive than fun** for many level 17–20 parties because it stacks multiple “boss multipliers” at once: very high AC (plus at‑will *shield*), strong per-round buffering, Magic Resistance + 4 Legendary Resistances, extremely high save DCs, frequent hard control (stun), and strong legendary action spellcasting. It’s also **likely under-labeled at CR 24**, especially if *Doombot Switch* is used as a second full life.

Below are the most actionable balance/format fixes.

---

## CR & math check (DMG-style)

### Defensive CR (rough)
- **HP 285** is around **CR ~18** baseline.
- **Personal Force Field (30 temp HP at start of every turn)** functions like ~30 damage shaved off each round. Over a typical 3–4 round boss fight that’s effectively **+90 to +120 HP**, putting him around **375–405 effective HP** (≈ **CR 22–24**).
- **AC 22** is ~3 higher than expected around that band (expected ~19), which bumps defensive CR **+1**.
- **Magic Resistance** and **Legendary Resistance (4/day)** further push survivability upward (not cleanly quantified by DMG, but in practice it’s another noticeable bump at tier 4).

**Result:** defensively he plays more like **CR 24–25** even before considering at‑will *shield* (which effectively makes AC 27 whenever he wants).

### Offensive CR (rough)
Baseline turn using Multiattack:
- Gauntlet: 33 avg (plus stun rider)
- 2× Eldritch Blast: 42 avg  
**= 75 DPR**

Legendary actions (most aggressive): 3× Arcane Blast = 63 DPR  
**Total ≈ 138 DPR** (CR ~23–24 DPR range)

But then the big flags:
- **Attack bonus +17** and **save DC 25** are about **+4 over expected** for CR 24 (expected ~+13 / DC 21). That pushes effective offensive CR up significantly because it converts “sometimes” effects into “almost always.”
- **Stun rider** on a hit with a very high to-hit is a major lethality/lockdown amplifier that the DPR table doesn’t capture well.

**Result:** offensively it plays like **CR 25–26**.

### “Doombot Switch” effect on CR
If *Doombot Switch* grants **full hit points and resources again**, that’s effectively a **second full boss**. That pushes the encounter well beyond CR 24 unless the first body is intentionally much weaker (or this is a “mythic” two-phase fight with adjusted XP/CR expectations).

**Bottom line:** label is likely **CR 25–26** as-is, and **higher (or “mythic”)** if Doombot Switch is used as written.

---

## Biggest gameplay issues (and fixes)

### 1) At-will *shield* + AC 22 = “can’t hit the boss”
At tier 4, martials still rely on attack rolls. With **AC 27 on demand**, many PCs will miss most of the time, creating a slog.

**Fix options:**
- Make *shield* **3/day** (classic monster design), or
- Replace with a suit feature: **Reactive Plating (Recharge 5–6)**: +5 AC until start of next turn, or
- Keep at-will *shield* but **drop base AC to ~19–20** (so shield raises it to 24–25, still strong but not absurd).

### 2) Personal Force Field is huge and currently rules-redundant
Temp HP already works the way you describe (“excess spills into real HP”), so the second sentence is unnecessary. The bigger issue is **30 temp HP every turn** is a *massive* attrition tax and pushes the fight toward “wearing down a spreadsheet.”

**Fix options:**
- Reduce to **15–20 temp HP**, or
- Make it **Recharge 5–6** as a bonus action or at end of turn, or
- Give counterplay: “The field is suppressed until the start of Doom’s next turn if he takes thunder damage / is hit by *dispel magic* (check) / is hit by a critical hit,” etc.

### 3) The Gauntlet Strike stun is too reliable
A **stun until end of target’s next turn** is a “skip your turn” effect. With **very high accuracy** and no usage limit, Doom can effectively delete a PC’s actions repeatedly.

**Fix options:**
- Make the stun **Recharge 5–6**, or
- Limit it: “**Once per turn** when Doom hits…,” or
- Downgrade to **restrained** or **knocked prone** (or “incapacitated until end of Doom’s current turn” if you want a brief opening without hard lock).

Also note an internal consistency issue:
- **Gauntlet Strike is +17 to hit**, but with STR 22 and PB +7 it should be **+13** unless the suit grants a bonus or uses INT for attack rolls. If you want +17, add a trait like:
  - “**Battle Suit Targeting.** Doom uses Intelligence for attack and damage rolls with his gauntlet weapons,” *or* “the suit grants a **+4** bonus to attack rolls.”

### 4) Dual concentration is encounter-warping
Concentrating on two spells lets him do things that PCs cannot and can produce “no-play” states: e.g., **Wall of Force + Telekinesis**, or battlefield control plus a hard disable.

**Fix options:**
- Remove it (simplest), or
- Constrain it: “Doom can concentrate on **two spells, but one must be 3rd level or lower**,” or
- Add a risk: “When he takes damage and makes concentration saves, he makes **one save with disadvantage** (or both saves with disadvantage).”

### 5) Siphon Power creates slot inflation/infinite value
As written: he casts a free 5th-level *counterspell* **without spending a slot**, then **regains** a slot. That’s effectively generating extra slots over the fight.

**Fix options:**
- Make it **Counterspell (5th-level) 3/day** with no slot regain, or
- If you want the “steal power” fantasy: on a successful counter, Doom gains **temporary hit points** or deals **arcane backlash** damage—don’t mint extra spell slots beyond his normal maximum.

### 6) Forcecage/Plane Shift + DC 25 can end PCs
At DC 25, effects like *banishment*, *polymorph*, and *plane shift* become extremely hard to resist. *Forcecage* is no-save removal. That can be fine for Doom, but it’s a **tone choice**: are you aiming for “comic-book boss fight” or “the villain wins unless players hard-counter”?

**Fix options:**
- If you want a fairer fight: lower INT (and thus DC) to **22–26** range (DC 22–23 is still brutal), or
- Keep DC 25 but reduce access to “hard removal” spells or restrict legendary-action casting to **damage/utility** rather than encounter-ending control.

---

## Action economy & flow
You’ve built a solo-boss chassis (legendary actions + resistances) correctly, but several pieces stack to create “Doom plays, party doesn’t”:

- **Frightful Presence** inside Multiattack is functionally “free,” but after the first round most PCs will either be immune (24h clause) or still frightened. Consider making it a **bonus action (1/day)** or **Recharge 5–6** so it’s a distinct moment, not a repeated header.
- **Legendary Action: cast a 5th-level spell** is very strong. Most official bosses either (a) cast cantrips, (b) use specific rider legendary actions, or (c) cast limited spells as legendary actions.

**Fix suggestion:** restrict “Gadget or Spell” to a curated list (e.g., *misty step, counterspell, fireball/steel wind strike equivalent, wall of force*), or make it **3/day**.

---

## “Doombot Switch” needs a rules-safe implementation
As a **Legendary Action**, it’s awkward:
- Legendary actions occur **at end of another creature’s turn**, but dropping to 0 HP can happen any time.
- “Full hit points and resources” is effectively a second encounter.

**Better implementations:**
1) **Mythic Trait (recommended):**  
   “When Doom is reduced to 0 hit points, his body detonates (…damage…), and Doom reappears with **X hit points** (often ~40–60% of max), regains expended legendary resistances, and gains access to a mythic action list.”  
   Then you award **mythic XP** per Theros/Fizban style.

2) **Decoy Trait (non-mythic):**  
   Make the first body explicitly a **Doombot** with reduced HP/abilities, and the “real Doom” is the actual statblock.

3) **Pure narrative escape hatch:**  
   If you truly want GM discretion, remove it from legendary actions and put it in a sidebar: “If Doom must survive for story, consider…”

---

## Thematic representation (what’s working / what to tweak)
**Working well:**
- High INT/Arcana/History, strong defenses, tech + magic blend, flight/hover, and Doombots are all very on-brand.
- Force/lightning suite fits “armor repulsors + sorcery.”

**Tweaks for theme clarity:**
- Rename **Eldritch Blast** to something setting-neutral like **Repulsor Bolt** or **Doom Ray** (unless you explicitly want warlock flavor).
- “Universal Translator” should be a **trait**, not parenthetical in Languages.
- Consider adding a **Doombot Commander**/“Summon Doombots (Recharge 6)” action if you want the Latveria/robotics feel without doubling Doom’s own life.

---

## 5e formatting & convention notes
- Creature type line is usually **Humanoid (human)** (lowercase “human”).
- If you’re using **Technology** as a skill, add a note that it’s homebrew, or convert it to **tool proficiency** (e.g., tinker’s tools) + Intelligence checks.
- “Mastermind’s Intellect” references initiative “included above,” but initiative isn’t listed. Either:
  - Add **Initiative +12** line (common in modern statblocks), or
  - Remove the parenthetical.
- Spell list: “5th level (3 slots)” lists only two spells. Either add a third prepared spell or change the presentation (monsters don’t need to list “prepared” perfectly, but consistency helps).
- If Doom has condition immunity to **poisoned**, consider whether he should also have **poison damage immunity** (many constructs/undead do; armored human maybe not).

---

## Concrete “tighten to CR 24” adjustment package (one possible route)
If your target is a **fair-but-deadly CR 24** boss:
1) **Remove dual concentration** (or limit it heavily).
2) Change *shield* to **3/day** (or drop base AC to 19–20 if keeping at-will).
3) Reduce force field to **15–20 temp HP**, or make it **Recharge 5–6**.
4) Gauntlet stun: **Recharge 5–6** and/or DC **21–23**.
5) Fix Gauntlet attack bonus math (**+13** unless you explain +17).
6) Rework Doombot Switch into a **mythic trait** (two-phase) *or* remove it from the combat statblock.

If you want, tell me whether Doom is meant to be (A) a **single-session final boss for level 20**, (B) a **recurring villain who must escape**, or (C) a **mythic two-phase fight**—and I’ll propose a revised statblock with CR-calibrated numbers and a cleaner Doom-themed action suite.