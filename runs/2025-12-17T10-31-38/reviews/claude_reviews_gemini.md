# claude reviews gemini

# Statblock Review: Victor Von Doom (CR 24)

This is an ambitious and flavorful conversion that captures much of Doom's essence. However, there are several balance concerns, formatting issues, and mechanical problems that need addressing. I'll break this down systematically.

---

## Executive Summary

| Category | Rating | Notes |
|:---------|:------:|:------|
| Thematic Accuracy | ★★★★★ | Excellent capture of Doom's character |
| 5e Formatting | ★★★☆☆ | Several convention violations |
| Mechanical Balance | ★★☆☆☆ | Significantly overtuned for CR 24 |
| Actual CR | ~27-30 | Listed as 24, plays much higher |
| Playability | ★★☆☆☆ | Several features create unfun gameplay |

---

## Critical Issues (Must Fix)

### 1. Scientific Sorcery — Dual Concentration is Game-Breaking

This single feature breaks bounded accuracy assumptions and 5e's core balance philosophy. Concentration exists specifically to prevent stacking powerful effects.

**Problematic Combinations:**
- *Wall of Force* + *Banishment* = isolate and remove threats simultaneously
- *Forcecage* + *Telekinesis* = trap and crush
- *Hold Person* + any damage concentration spell = guaranteed paralysis into damage

**Suggested Fix:**
> ***Scientific Sorcery.*** Doom ignores verbal and somatic components for his spells. Additionally, Doom can maintain concentration on *mind blank* without it counting against his normal concentration limit.

This preserves the "always prepared" flavor while eliminating degenerate combos.

---

### 2. Power Siphon — Overtuned and Anti-Fun

This reaction has **no cost**, **unlimited uses**, and **generates resources**. Compare to *counterspell*:

| Feature | Counterspell | Power Siphon |
|:--------|:-------------|:-------------|
| Cost | 3rd+ level slot | None |
| Uses/day | Limited by slots | Unlimited |
| Auto-success | ≤3rd level only | Never |
| Resource gain | None | Regains slot |
| Range | 60 ft. | 60 ft. |

This means Doom can contest **every spell** cast near him while also having actual *counterspell* prepared. Enemy spellcasters will have an utterly miserable experience.

**Suggested Fix:**
> ***Power Siphon (3/Day).*** When a creature within 60 feet of Doom casts a spell of 5th level or lower, Doom can use his reaction to attempt to absorb the energy. The caster must make a spellcasting ability check contested by Doom's Intelligence check. If Doom wins, the spell fails, and Doom regains one expended spell slot of a level equal to or less than half the absorbed spell's level (minimum 1st).

---

### 3. Spell Save DC 25 — Exceeds Expected Values

The DMG baseline for CR 24 is **DC 19**. DC 25 is **+6 above expected**, which translates to approximately +3 effective CR for save-or-suck spells.

| Character Save Bonus | Success Rate vs DC 19 | Success Rate vs DC 25 |
|:---------------------|:---------------------:|:---------------------:|
| +5 (poor save) | 35% | 5% |
| +9 (moderate) | 55% | 25% |
| +14 (optimized) | 80% | 50% |

Combined with *frightful presence* effects and dual save-or-suck concentration... this becomes oppressive.

**Suggested Fix:** Lower to **DC 23** (still very high) or **DC 22** (appropriate for CR 24 with other offensive boosts).

---

## Formatting & Convention Errors

### 4. "Technology" Is Not a 5e Skill
Remove it entirely, or replace with a second expertise in Arcana and add flavor text:
> *Doom's mastery of both magical and technological disciplines is unparalleled.*

### 5. Cantrip List Errors

**Problems:**
- *Eldritch blast* is a **Warlock exclusive** cantrip, not Wizard
- "meticulously word of radiance" — typo; *word of radiance* is **Cleric exclusive**

**Suggested Fix:**
```
Cantrips (at will): fire bolt, mage hand, prestidigitation, shocking grasp
```

Or, if you want the multi-beam blast:
> ***Eldritch Mastery.*** Doom has learned to cast *eldritch blast* (4 beams) through his study of forbidden texts. This counts as a wizard spell for him.

### 6. Titanium Gauntlet Not in Multiattack
The melee attack exists but isn't referenced in Multiattack. Either:
- Add it: "Doom makes two attacks: Gauntlet Blast, Titanium Gauntlet, or a combination thereof"
- Or remove the Titanium Gauntlet entirely if unintended

### 7. "Kneel Before Doom" — Grapple Mechanic Issue
Being "grappled by your own weight" has no creature source, which breaks 5e grapple conventions. The grappled condition specifically defines movement restriction by a "grappler."

**Suggested Fix:**
> On a failure, a creature takes 22 (4d10) psychic damage, is knocked prone, and is **restrained** by crushing gravitational force until the end of Doom's next turn. On a success, the creature takes half damage and suffers no other effects.

---

## CR Verification

Let me walk through the math:

### Defensive CR Calculation

| Factor | Value | Expected (CR 24) | Adjustment |
|:-------|:------|:-----------------|:-----------|
| Base HP | 325 | 326-340 | CR 18 |
| Effective HP (resistances) | ~490 | — | +2 CR |
| Temp HP (30/round × 3 rounds) | +90 | — | +1 CR |
| AC | 22 | 17 | +2 CR |
| Legendary Resistance | 3/day | — | +1 CR |
| Magic Resistance | Yes | — | +1 CR |

**Defensive CR: ~25**

### Offensive CR Calculation

**Damage Per Round (assuming 3 rounds):**
- Action: 2× Gauntlet Blast = 62 damage
- Legendary Actions: 3× Gauntlet Blast = 93 damage
- **Total physical DPR: 155**

With spellcasting:
- *Chain lightning* (8d10 = 44) + Gauntlet Blast (31) + LA spell = ~120+
- *Fireball* through LA = 28 average to multiple targets

| Factor | Value | Expected (CR 24) | Adjustment |
|:-------|:------|:-----------------|:-----------|
| DPR | ~150-200 | 186-205 | CR 24 |
| Attack Bonus | +17 | +10 | +3 CR |
| Save DC | 25 | 19 | +3 CR |

**Offensive CR: ~27-30**

### Final CR
**(Defensive 25 + Offensive 28) / 2 = CR ~26-27**

And this **doesn't account for**:
- Dual concentration's force multiplication
- Power Siphon's anti-caster dominance
- Pre-cast *mind blank* immunity to psychic damage/scrying

**Actual play CR: 27-30**

---

## Action Economy Analysis

This creature has overwhelming action density:

| Timing | Actions Available |
|:-------|:------------------|
| Turn Start | Gain 30 temp HP |
| Action | Multiattack (2 attacks or 1 + spell) |
| Bonus Action | *Misty step* |
| Reaction | Power Siphon OR *counterspell* OR *shield* |
| Between Turns | 3 Legendary Actions (can include 5th-level spells) |

A single party spellcaster faces Doom potentially **countering twice per round** (Power Siphon reaction + LA *counterspell*). This isn't challenging; it's frustrating.

---

## Thematic Wins (Keep These!)

Despite the balance issues, much here is **excellent**:

| Feature | Why It Works |
|:--------|:-------------|
| INT 30 | Perfect for Marvel's greatest genius |
| "Kneel Before Doom" name | *Chef's kiss* — perfect villain flavor |
| Force immunity + shield | Force fields! |
| Magic + Technology blend | Core Doom identity |
| CHA 24 | Ego made manifest |
| Legendary Resistance | "Doom does not fail" |
| Pre-cast *mind blank* | "Always prepared" trope |
| Truesight | Advanced sensor arrays |

---

## Missing Thematic Elements (Consider Adding)

### Doombots
Doom famously uses robotic decoys. Consider:

> ***Diplomatic Immunity (1/Day).*** When Doom would drop to 0 hit points, he can choose to reveal that "Doom" was actually a Doombot. He teleports to a location he has prepared within 1 mile, and the Doombot is destroyed. Doom cannot use this feature if he has already used Legendary Resistance that day.

### Ego as Weakness
Doom's pride is legendary and exploitable:

> ***Supreme Arrogance.*** If a creature uses its action to make a DC 22 Charisma (Performance or Persuasion) check to mock or challenge Doom's superiority and succeeds, Doom has disadvantage on his next attack roll or ability check as he focuses on that creature. Once a creature attempts this, it cannot do so again until it completes a long rest.

---

## Suggested Revised Statblock (Key Changes Only)

```markdown
**Challenge** 27 (105,000 XP)

**Skills** Arcana +24, History +17, Insight +12, Intimidation +14, 
Perception +12, Religion +17

***Scientific Sorcery.*** Doom ignores verbal and somatic components 
for his spells. Additionally, Doom can maintain concentration on 
*mind blank* without it counting against his concentration limit.

***Spellcasting.*** [...] spell save DC 23, +15 to hit [...]
Cantrips (at will): fire bolt, mage hand, minor illusion, 
prestidigitation, shocking grasp

***Power Siphon (3/Day).*** When a creature within 60 feet of Doom 
casts a spell of 5th level or lower, [...]

***Multiattack.*** Doom makes two attacks with his Titanium Gauntlet 
or Gauntlet Blast in any combination. He can substitute one attack 
for casting a spell of 3rd level or lower.

***Kneel Before Doom (Costs 3 Actions).*** [...] On a failure, a 
creature takes 22 (4d10) psychic damage, is knocked prone, and is 
restrained by crushing gravitational force until the end of Doom's 
next turn.
```

---

## Summary of Recommended Changes

| Priority | Issue | Fix |
|:---------|:------|:----|
| 🔴 Critical | Dual concentration | Limit to *mind blank* only |
| 🔴 Critical | Power Siphon | Add 3/day limit, cap at 5th level |
| 🔴 Critical | DC 25 | Reduce to DC 22-23 |
| 🟡 Important | Technology skill | Remove |
| 🟡 Important | Wrong cantrips | Replace with wizard-legal options |
| 🟡 Important | CR listing | Update to CR 27 |
| 🟢 Minor | Titanium Gauntlet orphaned | Add to Multiattack |
| 🟢 Minor | "Grappled by weight" | Change to restrained |
| 💡 Optional | Doombots | Add escape/decoy feature |
| 💡 Optional | Ego weakness | Add exploitable flaw |

---

## Final Thoughts

This statblock shows genuine love for both the source material and D&D 5e design. The thematic elements are spot-on. The mechanical issues stem from enthusiasm rather than ignorance — you've clearly aimed to make Doom feel as dangerous as he should.

The core problem is **feature stacking**: each powerful ability (dual concentration, infinite counter, +17 to hit, DC 25 saves, regenerating temp HP, legendary actions with full spellcasting) is strong alone but creates multiplicative power together.

Scale back the outliers, and you'll have a phenomenal high-tier boss that's both challenging and fair — worthy of the name Doom.