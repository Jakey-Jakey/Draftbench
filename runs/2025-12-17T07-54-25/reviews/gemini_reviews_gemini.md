# gemini reviews gemini

Here is a comprehensive review of your **Doctor Doom** statblock, analyzed from the perspective of 5e design mechanics, game balance, and thematic resonance.

### **Summary**
This is a **high-lethality, high-complexity boss** designed for Tier 4 play (Level 17+). You have captured the essence of Doom perfectly: he is arrogant, heavily armored, scientifically brilliant, and magically superior.

However, currently, this statblock swings between **oppressively unfun** (infinite counterspells, double concentration) and **lacking damage output** for a CR 24 creature. A party of level 20s might find him frustrating to fight rather than tactically engaging.

---

### **1. Mechanical Balance and Math**

**Challenge Rating (CR) Assessment:**
*   **Defensive CR:** Very High. 285 HP is deceptively low for CR 24, but AC 22, huge Saving Throws, Magic Resistance, and—most importantly—regenerating 30 THP per round makes him extremely durable. Effectively, players must deal 31+ damage just to scratch him.
*   **Offensive CR:** Low to Moderate. His at-will damage is roughly 75–80 per round. The DMG suggests a CR 24 monster should output ~243 damage per round. Doom relies on spells to bridge this gap, but his basic attacks are weak for this tier.
*   **Verdict:** He acts more like a Controller than a Blaster. He won't kill the party fast, but he will ensure they can't do anything.

**Key Issues:**
1.  **Stun DC & Saving Throws:** A **DC 25** Constitution save on the *Gauntlet Strike* is extremely punishing. A Wizard or Rogue with a +2 CON save literally cannot succeed on a natural 20. This is "save or die" design (stunned characters in Tier 4 die immediately).
2.  **Double Concentration:** *Techno-Magical Supremacy* allows him to concentrate on two spells. While thematic, in 5e math, this is dangerous. *Forcecage* + *Cloudkill* or *Wall of Force* + *Fly* has no counterplay.
    *   *Recommendation:* Keep it, but add a caveat that if his concentration is broken, *both* spells end. High risk, high reward.
3.  **Reaction - Siphon Power:** This is the biggest design flaw. An at-will *Counterspell* (5th level) means your caster players will likely **never** cast a spell successfully during the fight unless they represent a specific edge case (60+ ft range or Subtle Spell). This shuts down player agency too aggressively.
    *   *Recommendation:* Make this cost a resource (e.g., "Recharge 5–6" shared with Kneel Before Doom, or costs Legendary Actions). Or, limit it to 3/Day.

### **2. Action Economy & Attacks**

**Eldritch Blast Scaling:**
*   You have him firing 3 beams (3d10). At CR 24 (effectively level 20+), *Eldritch Blast* scales to **4 beams** (4d10).
*   *Correction:* Increase to 4 beams.
*   *Clarification:* In Multiattack, does "two Eldritch Blasts" mean two *beams* or two *casts* (8 beams)? Assuming two beams based on the damage math, phrasing it as "Doom makes two Ranged Spell Attacks" is clearer.

**Legendary Actions:**
*   **Gadget or Spell:** Casting a spell up to 5th level as a legendary action is incredibly strong (allowing *Wall of Force* off-turn). This is CR 30 (Vecna/Tiamat) territory.
*   *Recommendation:* Cap this at 2nd or 3rd level spells, or increase the cost to 3 Actions.

**Doombot Switch:**
*   This is not a Legendary Action; it is a **Mythic Trait** (seen in *Theros* or *Fizban’s*).
*   Restoring full resources and HP mid-combat and teleporting away is a "Reset Button." If used to continue the fight, it makes the encounter take 6+ hours. If used to escape, just give him a "Contingency" spell.
*   *Recommendation:* If this is a combat mechanic where a new Doom enters the fray, create a "Mythic Phase" where he refills HP but doesn't regain spell slots.

### **3. Thematic & Formatting Feedback**

**Attributes:**
*   **Intelligence 30:** This is iconic for Doom. Mechanically, it provides a +10 modifier.
*   **Attack Bonus:** +17 to hit (+10 Int + 7 Proficiency). The math checks out.
*   **Skills:** "Technology" isn't a standard 5e skill. While fine for homebrew, usually this is covered by "Arcana" or "Tinker's Tools."

**Spells:**
*   Doom combines Sorcery and Wizardry. Currently, his list is very Wizard-heavy.
*   *Suggestion:* Swap *Power Word Stun* for something more flavorful or destructive, like *Meteor Swarm* (reflavored as Orbital Bombardment). He needs a high-damage finisher.

**Formatting Nits:**
*   **Multiattack:** "One with his Gauntlet Strike and two with his Eldritch Blasts."
    *   Standard phrasing: "Doom makes three attacks: one with his Gauntlet Strike and two with Eldritch Blast."
*   **Damage Calc:** For *Eldritch Blast*, `3d10 + 5` implies he is not adding his +10 INT modifier to the damage (which Warlocks do with Agonizing Blast). If this is tech-based, he should probably add that +10 mod. `4d10 + 10` is scary but appropriate for CR 24.

---

### **Revised Statblock Excerpts (Use for Polish)**

Here are the specific changes I recommend to make him playable, fair, and terrifying:

**Revised Trait: Techno-Magic Supremacy**
> Doom’s attacks and effects ignore resistance to force and lightning damage. Additionally, Doom can maintain concentration on two spells at once. If he takes damage, he makes a single Constitution saving throw to maintain concentration on both spells. The DC is 10 or half the damage taken, whichever is higher.

**Revised Reaction: Siphon Power**
> **Siphon Power (Recharge 5–6).** In response to seeing a creature within 60 feet cast a spell, Doom attempts to interrupt it. If the creature is casting a spell of 5th level or lower, its spell fails and has no effect. If it is casting a spell of 6th level or higher, make an Intelligence check (DC 10 + the spell's level). On a success, the creature's spell fails and has no effect. If a spell is successfully countered, Doom targets the caster with an Eldritch Blast as part of this reaction.

**Revised Action: Gauntlet Strike**
> *Melee Weapon Attack:* +17 to hit, reach 5 ft., one target. *Hit:* 15 (2d8 + 6) bludgeoning damage plus 27 (6d8) lightning damage. The target must succeed on a DC 21 Constitution saving throw or be stunned until the start of Doom's next turn. (Lowered DC to be passable, increased damage to compensate).

**Revised Action: Eldritch Blast**
> *Ranged Spell Attack:* +17 to hit, range 120 ft., one target. *Hit:* 15 (1d10 + 10) force damage. (Note: Multiattack creates the volume of fire. If he fires 4 beams at +10 dmg each, that is 60 damage. Much better).

**Revised Doombot Trait (Mythic)**
> ***Doombot Protocol (Mythic Trait).*** If Doom is reduced to 0 hit points, he does not die or fall unconscious. Instead, his current armor reveals itself as a construct and explodes. Each creature within 20 feet must make a DC 25 Dexterity saving throw, taking 35 (10d6) fire damage on a failed save, or half as much on a successful one. The "real" Doom (or a fresh Doombot) teleports into the space, regaining 200 hit points and resetting the cooldown on *Kneel Before Doom*.

### **Final Verdict**
**Status:** **Needs Tuning.**
The current version is a "save-or-suck" monster that shuts down players rather than fighting them. By lowering the Stun DC slightly, fixing the infinite Counterspell loop, and buffing his raw output damage, he becomes a much more dynamic and terrifying threat worthy of the name **Doctor Doom**.