# gemini's Statblock (revised by gpt)

Here is the revised statblock for **Doctor Doom**.

This revision balances the original concept against 5th Edition design standards. It normalizes his offensive and defensive Challenge Rating to a true CR 24 (escalating to CR 26+ if his "Mythic" phase is triggered), resolves action economy bloat, clarifies 5e rule interactions (tech vs. magic), and removes mechanics that cause "hard locks" (like stunned/paralyzed loops) in favor of dynamic control.

***

# Victor Von Doom
*Medium Humanoid (Human), Lawful Evil*

*   **Armor Class** 22 (Titanium Alloy Powered Armor)
*   **Hit Points** 333 (29d8 + 203)
*   **Speed** 30 ft., fly 60 ft. (hover)

| STR | DEX | CON | INT | WIS | CHA |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 20 (+5) | 14 (+2) | 24 (+7) | 30 (+10) | 22 (+6) | 25 (+7) |

*   **Saving Throws** Con +14, Int +17, Wis +13, Cha +14
*   **Skills** Arcana +17, History +17, Insight +13, Intimidation +14, Perception +13
*   **Damage Resistances** Force, Lightning, Necrotic; Bludgeoning, Piercing, and Slashing from Nonmagical Attacks
*   **Condition Immunities** Charmed, Frightened, Exhaustion
*   **Senses** Truesight 60 ft., Passive Perception 23
*   **Languages** Common, Draconic, Infernal, Latverian, Primordial
*   **Challenge** 24 (62,000 XP)
*   **Proficiency Bonus** +7

***

**Scientific Sorcery.** Doom’s armor and magic are intertwined. He ignores verbal, somatic, and material components for his spells. Additionally, his **Arcane Gauntlet** and flight speed are technological; these features function in an *Antimagic Field*, though his spellcasting does not.

**Legendary Resistance (3/Day).** If Doom fails a saving throw, he can choose to succeed instead.

**Magic Resistance.** Doom has advantage on saving throws against spells and other magical effects.

**Mythic Trait: The Doombot Protocol (1/Day).** When Doom is reduced to 0 hit points, he does not die or fall unconscious. Instead, his current armor triggers a catastrophic failure sequence. He explodes, forcing each creature within 20 feet of him to make a DC 25 Dexterity saving throw, taking 35 (10d6) lightning damage on a failed save, or half as much on a successful one.

Doom’s outer shell shatters, revealing a secondary combat chassis (or revealing that the previous form was merely an advanced Doombot). He regains **166 hit points**. He immediately teleports to an unoccupied space within 300 feet.

***

### Actions

**Multiattack.** Doom makes two Arcane Gauntlet attacks. He can replace one of these attacks with a use of Spellcasting (Casting a cantrip or a spell of 3rd level or lower).

**Arcane Gauntlet.** *Melee or Ranged Weapon Attack:* +17 to hit, reach 5 ft. or range 120 ft., one target. *Hit:* 17 (2d6 + 10) bludgeoning damage plus 10 (3d6) lightning damage.

**Molecular Disruption (Recharge 5–6).** Doom emits destabilizing energy in a 60-foot cone. Each creature in that area must make a DC 25 Constitution saving throw. On a failed save, a creature takes 55 (10d10) necrotic damage and is **restrained** by destabilized gravity. A restrained creature can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success. On a successful save, the creature takes half as much damage and isn't restrained.

**Spellcasting.** Doom casts one of the following spells, using Intelligence as the spellcasting ability (Spell Save DC 25, +17 to hit with spell attacks):
*   **At will:** *Detect Magic, Mage Hand, Prestidigitation, Lightning Bolt (3rd level)*
*   **3/day each:** *Counterspell, Disintegrate, Telekinesis, Wall of Force, Lightning Bolt (5th level)*
*   **1/day each:** *Power Word Stun, Plane Shift, Time Stop, Meteor Swarm*

**Summon Guard Detail (1/Day).** Doom summons **2 Doombots** (use *Helmed Horror* statistics with a fly speed of 60 ft.) to unoccupied spaces within 60 feet. They act immediately after Doom’s turn.

***

### Bonus Actions

**Tactical Thrusters.** Doom takes the Disengage action or teleports up to 30 feet to an unoccupied space he can see.

***

### Reactions

**Techno-Magical Absorption.** When Doom takes damage from a spell or other magical effect, he activates his armor's siphon. He reduces the damage taken by **50**. If the damage is reduced to 0, Doom regains hit points equal to the amount of damage that was prevented (up to a maximum of 50).

***

### Legendary Actions

Doom can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. Doom regains spent legendary actions at the start of his turn.

*   **Gauntlet Blast.** Doom makes one Arcane Gauntlet attack.
*   **Look Upon Doom.** Doom fixes his gaze on one creature he can see within 60 feet. The target must succeed on a DC 25 Wisdom saving throw or become **Frightened** of Doom until the end of its next turn.
*   **Cast a Spell (Costs 2 Actions).** Doom uses Spellcasting to cast a spell of 1st through 3rd level.
*   **Kneel Before Doom (Costs 2 Actions).** Doom activates his gravitational generators. Each enemy within 30 feet of Doom must succeed on a DC 25 Strength saving throw or be pulled up to 15 feet straight toward him and fall **Prone**.

***

### Mythic Actions
If the **Doombot Protocol** trait has triggered in the last hour, Doom can use the options below as legendary actions.

*   **Overclock (Costs 2 Actions).** Doom recharges his *Molecular Disruption*.
*   **Total Annihilation (Costs 3 Actions).** Doom casts *Disintegrate* or *Lightning Bolt* (5th level).

***

### Change Log & Design Notes

Based on your feedback, the following specific changes were made to balance the encounter while preserving the "Campaign Ender" feel:

1.  **Mythic Transformation (Doombot Protocol):**
    *   *Change:* Converted the random "d20 roll on death" into a standard Mythic Trait (Phase 2).
    *   *Why:* Random rolls to see if the boss dies are anticlimactic. Now, the players fight through 333 HP, the armor explodes (Phase Change), and he heals back to half (166 HP) for a final push. This essentially gives him ~500 HP total, appropriate for CR 24+.

2.  **Defensive Tuning:**
    *   *Legendary Resistance:* Reduced from 4 to 3. (Standard for 5e design).
    *   *Indomitable Ego:* Removed. Stacking this with Magic Resistance and high saves made him mathematically immune to everything.
    *   *Techno-Magical Absorption:* Changed from "Nullify & Heal" to "Reduce by 50 & Heal." This prevents him from ignoring 100+ damage nukes entirely, while still shutting down standard hits.

3.  **Spellcasting & Action Economy:**
    *   *Casting Times:* *Shield*, *Misty Step*, and *Counterspell* were moved to appropriate sections or spell lists to respect action economy.
    *   *At-Will Spells:* *Lightning Bolt* is now at-will at **3rd level**, but limited at 5th level. *Counterspell* is limited to 3/day to prevent him from shutting down every single caster turn.
    *   *Bonus Actions:* Added **Tactical Thrusters** to give him mobility without burning spell slots on *Misty Step*.

4.  **Control Mechanics (Fun vs. Frustration):**
    *   *Molecular Disruption:* Changed "Paralyzed" to "**Restrained**." Paralyzed guarantees critical hits and skip turns, which is often unfun. Restrained makes them vulnerable but lets them act.
    *   *Kneel Before Doom:* Changed from "End Turn" (Hard Lock) to "Pull + Prone" (Soft Control). This physically forces players to "kneel" without stopping them from playing the game.

5.  **Summons:**
    *   *Summon Guard Detail:* Fixed the number to **2** Doombots. Rolling 1d4 made the difficulty swing too wildly (4 Helmed Horrors change the CR math significantly; 2 is manageable context).