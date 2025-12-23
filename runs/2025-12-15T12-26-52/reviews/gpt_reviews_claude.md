# gpt reviews claude

## High-level take
This is a very flavorful “raid boss” take on Doctor Doom: extremely hard to pin down, battlefield control heavy, and punishing to casters. Mechanically, though, he’s *stacking* several top-tier defensive layers (very high AC, broad resistances, resistance to spell damage, big damage reduction, and a rechargeable “resistance to all damage”) while also pushing strong control (stun on hit, AoE frighten/paralyze, forcecage/wall of force) and high sustained DPR via legendary actions. In play, that combination risks (1) a long, frustrating grind where PCs can’t meaningfully affect him, or (2) sudden “oops, you’re paralyzed/stunned and dead” spikes.

Below is detailed feedback by category, with concrete adjustments you can choose from depending on the intended experience.

---

## 1) CR accuracy (DMG math + practical table impact)

### Defensive CR (effective durability)
- **HP 333** suggests **DCR ~22** (331–345 range).
- **AC 24** is ~+5 over expected AC 19 at that tier → pushes DCR up about **+2** → **~24**.

But that’s *before* considering the “hidden” durability multipliers:
- **Reactive Force Field** (reaction, reduce damage by 35) is enormous at this tier. Many PC hits are in the 25–45 range; this can nullify a whole attack/spell each round.
- **Energy Shield (Recharge 4–6)** grants **resistance to all damage** (plus +5 AC) for a full round. That’s a huge EHP spike and it’s not limited per day.
- **“Resistance to damage from spells”** is one of the biggest multipliers you can add at high CR because parties lean heavily on spells for both damage and control.
- **Magic Resistance + very high saves + Legendary Resistance** already make him extremely resistant to spell effects; adding spell damage resistance on top often becomes overkill.

**Practical result:** defensively he will often *play* more like **CR 26–28**, depending on party composition (especially caster-heavy groups).

### Offensive CR (damage + control)
Baseline sustained DPR can be very high:
- **Turn:** 3× Energy Blast (27 avg each) = **81**
- **Legendary actions:** up to 3× Energy Blast = **+81**
- Total typical sustained single-target DPR: **~162/round**

That DPR maps roughly to **OCR ~22** by DMG damage bands, *but* control riders can raise “practical OCR”:
- **Gauntlet Strike stun** (repeatable, potentially multiple times/round) can remove turns.
- **Doom Speaks** can AoE **frighten** and sometimes **paralyze** (paralysis is a lethal swing condition).
- **forcecage/wall of force/time stop** can create “no-play” scenarios.

**Practical result:** offensively he’s in the **CR 23–25** feel range, with occasional encounter-warping spikes.

### Net
Your listed **CR 24** is not crazy on paper, but **in play this is likely harder than CR 24** for many parties because his defenses and denial tools are layered so thickly that PC options narrow dramatically.

If you want him to *feel* like a fair CR 24, I’d tune down 1–2 defensive layers and slightly reduce turn-denial.

---

## 2) Mechanical balance & gameplay feel (biggest risk points)

### A) Defensive “stacking” creates grind
Right now Doom can combine:
- AC 24 baseline
- **Energy Shield** (+5 AC and resistance to all damage)
- **Reactive Force Field** (-35 damage)
- Resistances (elements + nonmagical B/P/S)
- **Resistance to spell damage**
- Great saves + Magic Resistance + LR

This can easily produce multiple rounds where PCs feel like they accomplished nothing, especially if Doom is also walling/forcecaging.

**Suggested fixes (pick 2–3):**
1. **Remove “resistance to damage from spells”** from Doom’s Armor, *or* move it onto **Energy Shield** (“while Energy Shield is active, Doom has resistance to damage from spells”).
2. **Reduce Reactive Force Field** from 35 → **20–25**, *or* make it **PB per day**, *or* make it reduce damage by **(4d10)** (swingy but less consistently oppressive).
3. **Energy Shield:** remove either the **+5 AC** *or* the **resistance to all damage**. Having both at once is “mini-invulnerability.”
   - Example: “Until the start of his next turn, Doom gains +5 AC and advantage on saving throws against spells” (no all-damage resistance), *or*
   - “Until the start of his next turn, Doom has resistance to all damage, but his AC doesn’t increase.”

### B) “No-play” for casters
- **Arcane Supremacy** currently reads like **unlimited 5th-level counterspell** (no resource cost).
- On top of that, Doom has high DC, Magic Resistance, Legendary Resistance, and “reflect damage when he succeeds.”

That combination can make many caster turns feel wasted.

**Suggested fixes:**
- Make **Arcane Supremacy** **3/day** (or Recharge 5–6), or have it **expend** one of his listed *counterspell* uses.
- Consider changing **Indomitable Will** reflect damage to be **1/turn**, or require a **reaction**, or trigger only when he uses **Legendary Resistance**. As-written, it punishes casters for even trying.

### C) Stun-lock potential in melee
**Gauntlet Strike** stuns until end of target’s next turn on a failed Con save. With three attacks/turn (and possible LA pressure), Doom can fish for stuns repeatedly.

**Suggested fixes:**
- Limit to **1/turn** (“the first time Doom hits a creature on his turn…”), or
- Change stun to **incapacitated until start of Doom’s next turn** (shorter), or
- Change it to a softer rider (e.g., **can’t take reactions**, or **disadvantage on attacks**, or **speed 0**).

### D) Doom Speaks: AoE paralyze is extremely swingy
Frighten in an aura-style burst is fine. **Paralysis** (even for 1 round) can create instant deaths due to auto-crits at melee range.

**Suggested fixes:**
- Remove paralysis; on fail-by-5 impose **stunned** or **restrained** instead.
- Or make the paralyze apply to **one creature Doom can see** (not all hostiles).

---

## 3) Action economy & turn structure

He has:
- Strong **Action** (3 attacks or spell replacement)
- Always-useful **Bonus Action** reposition (plus a rechargeable defensive bonus action)
- Extremely strong **Reaction** choices (counterspell, -35 damage, forced-move reduction)
- **3 Legendary Actions**
- **Lair actions** that can add multiple extra bodies

That’s “mythic boss” levels of throughput. It’s doable, but it increases DM load and can overwhelm players.

**Suggestions:**
- Consider merging reactions into a single reaction with options, and/or limiting total “big negation” per round:
  - Example: “Doom can take only one reaction per round, and if he uses Reactive Force Field he can’t also use Arcane Supremacy until the start of his next turn.” (This is already technically true by reaction rules, but calling it out helps you police the power budget.)
- Reduce Legendary Action damage spam slightly:
  - If you keep **Energy Blast** at 27 avg, consider making it cost **2 legendary actions** (or reduce damage to ~18–22).

---

## 4) 5e formatting / rules clarity issues

### Spellcasting presentation
- Monster spellcasting is fine as “X-level spellcaster,” but you’re not using slots. That’s common in homebrew, but clarity improves if you use either:
  1) **“Spellcasting (X/day)”** style (current approach), *or*
  2) Full “spell slots” style.
- **Important:** clarify whether **Sorcerous Wrath** and the Multiattack “replace an attack with a spell” **consume the per-day uses** of spells. Rules-as-written, they should, but many readers will wonder.

**Add a line:** “Casting a spell this way expends a use of that spell, as normal.”

### “Energy Blast ignores cover”
In 5e, you generally can’t ignore **total cover**. Recommend:  
“ignores half cover and three-quarters cover.”

### “Languages all”
“All” is unusual in 5e statblocks (and implies truly everything). Suggest something like:
- “Common, Latverian (dialect of Common), Draconic, Infernal, and any five languages”

### Doom’s Armor: “resistance to damage from spells”
This is a real effect in 5e (seen on some creatures), but it’s very high impact. If you keep it, it should be one of his *signature* defensive pillars—meaning you probably want to remove or soften something else (damage reduction, all-damage shield, etc.).

### Doombot Protocol
Cool thematically, but mechanically it’s not a standard trait pattern. Consider framing it like:
- **“Deception Protocol (1/Day). When Doom would be reduced to 0 hit points…”** (your wording is close)
- Add guidance for *how players can learn it was a Doombot* (Arcana/Investigation checks, telltale clues), so it doesn’t feel like a “gotcha.”

---

## 5) Lair actions & encounter balance

### Servo-Guard Deployment is very swingy
Four **veterans** (even modified) is a *lot* of extra DPR and HP injected repeatedly. If Doom can spawn these more than once, the fight can spiral into an add-fest that drags.

**Options:**
- Make it **2 guards** instead of 4, or use **guard**/**thug**-tier constructs.
- Make it **1/encounter**, or “only if Doom has no Servo-Guards active.”
- Consider using a purpose-built “Servo-Guard” statline with lower DPR but useful control (grapples, suppressive fire) to match Doom’s theme without bloating combat length.

### Temporal Lock wording
“Cannot benefit from spells or effects that grant additional actions” is extremely broad and can be read to affect class features (Action Surge) depending on how your table interprets “effects.”

Recommend tightening:
- “Creatures can’t cast *misty step*, *dimension door*, *teleport*, *plane shift*, or similar teleportation magic, and can’t gain an additional action from spells such as *haste*.”

---

## 6) Thematic representation (what you nailed + what you can enhance)

### What’s strong
- The blend of **science + sorcery** is clear (force tech blasts + high-level arcana).
- **Doombot Protocol** is extremely on-brand.
- Pride-based flaw is great roleplay scaffolding.

### What could be more “Doom” in play
Doom is not just hard to kill; he’s a *planner* and *controller*. You already have wall/forcecage/time stop—good. If you want a more Doom-feeling fight and less raw negation:
- Add an **“Exploit Weakness”** style ability (marks a PC, learns resistances, imposes disadvantage on a save once/round).
- Add more **battlefield manipulation** that creates choices (magnetized floors, rerouting power nodes) rather than just “you can’t act.”

---

## 7) Concrete “tuning packages” (pick a target experience)

### Package A: Keep CR 24, reduce frustration
- Remove **resistance to spell damage** from Doom’s Armor.
- Reactive Force Field: reduce to **25**.
- Doom Speaks: remove **paralyzed** rider (fail-by-5 becomes **stunned** until end of next turn).
- Arcane Supremacy: **3/day**, or expends *counterspell* uses.

### Package B: Keep him as an “unfair” Doom (CR 26-ish), but cleaner
- Keep spell damage resistance *or* all-damage shield (not both).
- Make Energy Shield **1/short rest** (or 3/day) instead of recharge.
- Make Servo-Guard Deployment **1/encounter**.
- Make Gauntlet stun **1/turn**.

### Package C: Make Doombot Protocol a mythic-style second phase (very Doom)
Instead of ending the encounter, use it to *change the encounter*:
- Phase 1: Doombot (lower HP, simpler kit)
- Phase 2: Real Doom arrives (or “armor unlocks”), gains new legendary actions or spells
This preserves player victory feelings while delivering the “it was a Doombot” moment.

---

## 8) Small polish notes
- Consider specifying whether Doom’s fly speed is from armor and whether it’s magical (matters vs antimagic).
- If Doom “cannot be targeted by divination,” decide whether that blocks *true seeing*/*see invisibility* interactions (some tables will ask).
- Passive Perception 22 is correct (Perception +12), good.

---

If you tell me the intended party level/size and magic item density (e.g., 4 PCs at level 17 with very rare items), I can give a tighter CR estimate and recommend exact numeric targets (DPR, save DC, and defense values) for the experience you want.