# gpt reviews gemini

## High-level take
You’ve captured the *idea* of Doom very well: armored dictator-sorcerer with doombots, battlefield control, and the ability to “nope” key moments. Mechanically, though, the current numbers and a few swingy mechanics push him well above CR 24 in actual play—especially because (a) his round-by-round damage is extremely high once legendary actions are included, (b) his save DC/attack bonus are far above typical CR 24 expectations, and (c) **Doombot Decoy** is effectively a *full second Doom*.

Below is feedback by category, plus concrete tuning suggestions.

---

## 1) CR accuracy & numerical balance (DMG math)
### Defensive CR (too high once traits are counted)
- **HP 402** is already around **defensive CR ~22** on the DMG table.
- You then add multiple impactful defenses:
  - **Resistances:** cold, fire, force (force is a *big* deal at high level), plus nonmagical B/P/S (mostly irrelevant at tier 4, but still “free”)
  - **Immunities:** lightning, poison
  - **Magic Resistance** (functionally worth a noticeable bump)
  - **Legendary Resistance (3/day)**
  - **AC 22** plus access to **shield at will** (see below)

Using DMG guidance, resistance/immunity at tier 4 often pushes effective HP by ~×1.25 **if** the resistances are meaningfully relevant. With **fire/cold/force** they *are* relevant. That puts him roughly in the **CR 24 HP band** *before* factoring Magic Resistance / at-will *shield* / LR.

**Main issue:** **Doombot Decoy** as written is essentially “when he’s about to lose, he becomes a fresh CR 24 boss again.” That’s not a small defensive perk; it’s a second full encounter stapled onto the first. If this is intended as a mythic phase, it needs to be budgeted like one (see Mythic notes below).

### Offensive CR (significantly too high)
Baseline sustained DPR if he just “punches”:
- **Arcane Gauntlet** average: 3d6+10 (20.5) + 2d10 (11) = **31.5**
- **Multiattack (3 attacks)** = **94.5 DPR**
- **Legendary Actions:** he can do **3 more Gauntlet Blasts** for **94.5 DPR**
- Total sustained output: **~189 DPR** *without* counting spells, lair actions, fear, summons, or control that grants advantage/auto-crits.

That DPR is more in the **CR 27-ish** neighborhood, and it gets worse because:
- His **attack bonus is +18**, which is extremely high for CR 24 expectations.
- His **save DC 26** is likewise extremely high (CR 24 guidelines are closer to ~21).

**Net:** Even before the “real Doom appears with full resources,” his offense reads like **CR ~27–29** in practice.

---

## 2) Action economy & “feel” in play
### Multiattack + Frightful Presence (infinite use problem)
As written: “Doom uses his Frightful Presence” is part of Multiattack, with no recharge or 1/Day limit. That means he is re-applying a party-wide fear effect *every single turn*, which is both mechanically oppressive and also not how most 5e fear auras are gated.

**Suggestion:**
- Make **Frightful Presence** either **Recharge 5–6**, **1/Day**, or “each creature repeats the save only when it takes damage” style.
- Or make it a **bonus action** 1/Day, so it’s a signature opener, not a perpetual lockdown.

### Legendary Actions: too much “free DPR”
“Gauntlet Blast” costing **1** legendary action means his baseline damage is essentially “double-turning” every round. That’s a big reason his offensive CR spikes.

**Suggestion options (pick one):**
- Make **Gauntlet Blast cost 2 actions**, *or*
- Limit Gauntlet Blast to **once per round**, *or*
- Drop his Multiattack to **2 attacks** if you want to keep 1-action Gauntlet Blast.

### Spellcasting + Legendary spellcasting + double concentration = hard locks
The combination of:
- **Double concentration**
- **Forcecage / Wall of Force / Maze / Power Word Stun**
- Legendary-action casting (3rd or lower)
…can remove multiple PCs from meaningful play with very few counterplay windows.

That can be “accurate Doom,” but it risks feeling like the DM is simply turning off characters.

**Suggestion:** Build in counterplay:
- Give his strongest “turn-off-a-PC” tools **cooldowns**, **limits**, or **clear break conditions** (e.g., tech nodes to destroy, concentration vulnerability, etc.).
- Consider limiting double concentration to **one “tech” concentration + one “magic” concentration**, with a specific way to disrupt the tech one.

---

## 3) The biggest gameplay issues (and fixes)

### A) **At-will shield** is a major spike
At-will *shield* means Doom can effectively sit at **AC 27** every round with no resource pressure. At tier 4, players already struggle to land hits against AC 22; AC 27 becomes “only crits and optimized builds connect.”

**Fix options:**
- Make *shield* **3/day** or **PB/day**.
- Or keep at-will *shield* but **lower base AC** (e.g., 19–20).
- Or remove **Tech-Shield** reaction if *shield* stays (they’re redundant and stack awkwardly in terms of design intent).

### B) **Doombot Decoy** is a “gotcha” that invalidates player climax moments
Triggering on **a natural 20** or **<50 HP** and then restoring **full hit points and resources** will routinely erase the party’s biggest hits/spells. That can be memorable once, but it’s also the kind of mechanic that can make players feel like their choices didn’t matter.

**Better mythic framing:**
- If you want a second phase, present it as a **Mythic Trait** with a **defined second HP pool** (e.g., “Doom regains 200 hp, recharges X, and his gauntlets overcharge”), rather than “full reset.”
- If you want it as a twist, trigger it at a **scripted threshold** (e.g., first time he hits 0 hp), not on a crit (which is a player-celebration moment).

### C) **Ovoid Mind Transfer** can permanently delete PCs
Body takeover/soul ejection is extremely campaign-warping. As a villain plot device, great. As a combat trigger at 0 hp, it can become “you lose your character, no recourse” unless you specify restoration rules.

**If you keep it:**
- Clarify what happens to the displaced soul and **how it can be restored** (e.g., *wish*, *true resurrection*, *divine intervention*, special ritual).
- Add constraints: target must be **incapacitated**, **restrained**, or **willing**, or Doom must maintain concentration for 1 minute, etc.
- Consider making it an **escape/continuity** feature (“Doom survives”), not an in-combat PC-removal.

### D) Summoning 1d4 Helmed Horrors repeatedly can snowball
A lair action that can add **up to 4 CR 4** bodies every other round can overwhelm initiative and table time fast, while also spiking encounter difficulty unpredictably.

**Fix options:**
- Summon **2** doombots (flat), or **1d2**, or make it **1/encounter**.
- Use a **weaker doombot statline** (CR 1–2) in groups, or a single elite bot.

---

## 4) Thematic representation (what’s working, what’s missing)
### Working well
- Dual mastery vibe: heavy armor + wizard list + battlefield control.
- Doombots and decoy concept: very Doom.
- “Indomitable Will” and emotion/thought immunity: on brand.

### Consider adding Doom-specific “commanding monarch” tech/sorcery hooks
Right now, a lot of his kit is “archmage in power armor.” To make him feel uniquely Doom:
- Add an **Aura of Authority**: allies (doombots) get bonuses; enemies have disadvantage on saves vs being frightened/charmed while within X ft.
- Add **Techno-Sorcerous Countermeasures**: e.g., once/round when he succeeds on a save vs a spell, he can arc feedback damage or identify the caster.
- Add a signature “no, *you* kneel” moment that isn’t just upcast *hold person* spam (see below).

---

## 5) 5e formatting & rules-convention notes
- **Creature type formatting:** usually “Medium humanoid (human), lawful evil” (lowercase humanoid).
- **Technology skill:** fine as a setting add-on, but in “core 5e formatting,” you’d either omit it or define it in a sidebar.
- **Armor trait clarity:** “AC includes his Intelligence modifier” is unusual in monster design. It’s fine, but consider writing it as a self-contained formula (“While wearing his infernal tech-armor, Doom’s AC is 22.”) and put the lightning absorption as a separate trait.
- **Lightning absorption vs immunity:** you currently say he’s immune to lightning *and* heals from lightning. That works, but it should be explicit that he heals **when he would take lightning damage** (even though it’s 0).
- **Reaction wording:** “hit by an attack represented by a roll of 20” should be “when a creature scores a critical hit against Doom” (cleaner rules language).
- **Spell list mismatch:** your tactics mention *fire shield* but it’s not prepared.
- **Legendary action casting:** “casts a spell of 3rd level or lower” is fine, but consider restricting it to **non-concentration** spells to reduce double-lock scenarios.

---

## 6) Concrete tuning recommendations to land closer to CR 24 (while staying Doom)
If your target is truly “CR 24 boss for level 17–20,” here are the most impactful, least invasive changes:

1) **Bring DC/accuracy closer to CR 24 norms**
- Drop spell save DC from **26 → 23 or 24**
- Drop attack bonus from **+18 → +15 or +14**
  - You can keep INT 30 narratively, but monsters don’t have to perfectly follow PC math.

2) **Fix the damage engine**
- Either:
  - Multiattack **2 gauntlets** (not 3), *or*
  - Make **Gauntlet Blast cost 2 legendary actions**, *or*
  - Reduce Gauntlet damage to ~24–26 average instead of 31.5.

3) **Gate Frightful Presence**
- Add **Recharge 5–6** or **1/Day**, and make Multiattack wording optional.

4) **Rebuild Doombot Decoy as mythic phase (recommended)**
- Replace “full hit points and resources” with something like:
  - “Doom regains 200 hit points, ends all conditions on himself, and recharges Legendary Resistance (1).”
- Present it explicitly as a **mythic encounter** expectation (and budget encounter difficulty accordingly).

5) **Constrain double concentration**
- Example constraint that keeps the fantasy but adds counterplay:
  - “Doom can concentrate on two spells, but one must be 5th level or lower and is maintained by his armor. If Doom is subjected to *antimagic field* or takes thunder damage, the armor-maintained spell ends.”

6) **Rework “Kneel Before Doom”**
- Upcast *hold person* at DC 26 as a repeatable legendary is brutal.
- Consider making it:
  - **1/Day**, or
  - **Costs 3 actions and targets one creature**, or
  - Replace *hold person* with a Doom-flavored effect: “One creature that can hear Doom must succeed on a Wis save or be knocked prone and silenced until end of its next turn” (strong, but not “you don’t play”).

---

## 7) Final “table risk” checklist
- **Hard-lock stacking:** double concentration + forcecage/maze/PW stun can remove 2–3 PCs from play.
- **Swingy invalidation:** Doombot Decoy negating crits / big novas feels punitive.
- **Too many bodies:** repeated helmed horror summons bog down combat length.
- **Too-high DCs:** DC 26 makes many classes feel helpless; tier-4 PCs still commonly have weak saves.

If you tell me whether you want Doom to feel (A) “fair but terrifying,” (B) “unfair comic-book boss,” or (C) “mythic setpiece with a phase change,” I can suggest a tight set of numbers (HP/AC/DC/DPR) that hits that exact experience while staying near your intended CR.