# Replace Playoffs with Active Learning Finale

## Overview

The current system runs a **fixed-cost round-robin playoff** after Swiss:
- Top-N contestants (default 8) play every other top-N contestant
- Each pair judged by `playoffJudges`
- Cost: N×(N-1)/2 × judges = 28 matches for Top-8 with 2 judges

The proposed system replaces this with an **active learning finale**:
- Iteratively selects the most informative pairs (highest uncertainty)
- Runs matches until confident about the full top-K ordering
- Stops when all adjacent pairs in top-K have separated confidence intervals
- Typical cost: 10-20 matches (variable based on skill distribution)

---

## User Review Required

> [!IMPORTANT]
> **Breaking Change**: The `roles.playoffJudges` config key will be renamed to `roles.finaleJudges`. Old configs will need updating, though we can add migration warnings.

> [!IMPORTANT]
> **Behavior Change**: The finale phase will have variable cost. In pathological cases (all top-K very close in skill), it could approach or exceed current playoff cost. We add a `maxMatches` budget cap to prevent runaway costs.

> [!WARNING]
> **Output Format**: The `playoff_rounds.md` and `playoff_judgments/` outputs will be replaced by `finale_rounds.md` and `finale_judgments/`. Leaderboard output will no longer show "Playoff Points" columns.

---

## Proposed Changes

### Configuration Layer

#### [MODIFY] [config.ts](file:///c:/Users/Myren/programming/Draftbench/config.ts)

1. **Rename `playoffJudges` → `finaleJudges`** in [RolesConfig](file:///c:/Users/Myren/programming/Draftbench/config.ts#31-45) type
2. **Rename `playoffSize` → remove** (use `stopRules.topK` instead)
3. **Repurpose [DisambiguationConfig](file:///c:/Users/Myren/programming/Draftbench/config.ts#93-110) → `FinaleConfig`**:
   ```typescript
   interface FinaleConfig {
     enabled: boolean;              // replaces disambiguation.enabled
     maxMatchesPerBatch: number;    // parallelism within a batch
     maxTotalMatches: number;       // budget cap
     targetWinProb: number;         // information gain target (0.5)
     confidence: number;            // CI separation confidence (0.9)
     minSeparation: number;         // fallback rating gap threshold (0)
     allowOverRepeatCap: boolean;
   }
   ```
4. Remove `disambiguation` config section (merged into `finale`)
5. Update `DEFAULT_CONFIG`, `validates`, and TOML parsing
6. Add `getFinaleJudges()` function (replaces `getPlayoffJudges`)
7. Keep `getPlayoffJudges` as deprecated alias with console warning

---

#### [MODIFY] [config.default.toml](file:///c:/Users/Myren/programming/Draftbench/config.default.toml)

```diff
 [roles]
 # ... existing roles ...
-[[roles.playoffJudges]]
+[[roles.finaleJudges]]
 model = "anthropic/claude-opus-4.5"
 effort = "low"

-[[roles.playoffJudges]]
+[[roles.finaleJudges]]
 model = "openai/gpt-5.2"
 effort = "medium"

 [tournament]
 swissRounds = 7
-playoffSize = 8          # REMOVED - uses stopRules.topK instead
 
-[tournament.disambiguation]
-enabled = true
-judgesSource = "playoff"
-maxMatchesPerSwissRound = 2
-maxTotalMatches = 12
-# ... etc
+[tournament.finale]
+enabled = true
+maxMatchesPerBatch = 4      # parallel matches per iteration
+maxTotalMatches = 30        # budget cap
+targetWinProb = 0.5         # prioritize 50/50 matchups
+confidence = 0.9            # CI separation confidence
```

---

### Core Modules

#### [NEW] [scheduling/activeRanking.ts](file:///c:/Users/Myren/programming/Draftbench/scheduling/activeRanking.ts)

New module implementing the active learning pair selection algorithm:

```typescript
interface ActiveRankingContext {
  standings: RatingStanding[];
  ratingState: RatingState;
  repeatCounts: Map<string, number>;
  maxRepeatPairs: number;
  targetWinProb: number;
}

interface ActiveRankingResult {
  pairs: [string, string][];
  allSeparated: boolean;
  unseparatedPairs: [string, string][];
}

/**
 * Plans the next batch of matches for active ranking.
 * Focuses on ALL uncertain pairs within a scope (not just K/K+1 boundary).
 */
export function planActiveRankingBatch(
  context: ActiveRankingContext,
  scope: string[],           // IDs to consider (e.g., top-K)
  maxBatchSize: number,
  confidenceLevel: number,
): ActiveRankingResult;

/**
 * Checks if all adjacent pairs in the ordered list have separated CIs.
 */
export function allPairsSeparated(
  standings: RatingStanding[],
  scope: string[],
  confidenceLevel: number,
): { separated: boolean; unseparated: [string, string][] };
```

Key logic:
1. For each adjacent pair in the scope, check if CIs overlap
2. Score all pairs by `|winProb - 0.5|` (lower = more informative)
3. Return top-N pairs for the batch, respecting repeat limits

---

#### [NEW] [phases/finale.ts](file:///c:/Users/Myren/programming/Draftbench/phases/finale.ts)

New phase module replacing [phases/playoff.ts](file:///c:/Users/Myren/programming/Draftbench/phases/playoff.ts):

```typescript
interface FinalePhaseResult {
  finaleMatches: StoredFinaleMatch[];
  iterations: number;
  converged: boolean;
}

export async function runFinalePhase(
  runDir: string,
  finaleLogPath: string,
  finaleJudgmentsDir: string,
  state: PipelineState,
  contestants: SwissContestant[],
  revisionsById: Map<string, RevisionEntry>,
  dryRun: boolean,
  isResuming: boolean,
): Promise<FinalePhaseResult>;
```

Main loop:
```
topK = stopRules.topK contestants by rating
while (!allPairsSeparated(topK) && matchCount < maxTotalMatches):
    pairs = planActiveRankingBatch(topK, maxBatchSize)
    results = await Promise.all(pairs.map(runMatch))
    updateRatings(results)
    matchCount += pairs.length
```

---

#### [MODIFY] [phases/swiss.ts](file:///c:/Users/Myren/programming/Draftbench/phases/swiss.ts)

1. **Remove inline disambiguation logic** (lines 990-1190) - this moves to `phases/finale.ts`
2. Keep basic Swiss logic intact
3. Swiss now always runs to completion or stop rules (no mid-Swiss disambiguation)
4. Return rating state for finale to consume

---

#### [DELETE] [phases/playoff.ts](file:///c:/Users/Myren/programming/Draftbench/phases/playoff.ts)

Entire file deleted (350 lines). Functionality replaced by `phases/finale.ts`.

---

### State Management

#### [MODIFY] [state.ts](file:///c:/Users/Myren/programming/Draftbench/state.ts)

```diff
 interface PipelineState {
   // ... existing fields ...
   
-  // Playoff state
-  playoffResults: StoredPlayoffResult[] | null;
-  completedPlayoffPairs: string[];
+  // Finale state (active learning)
+  finaleMatches: StoredFinaleMatch[] | null;
+  finaleIterations: number;
+  finaleConverged: boolean;
 }

-interface StoredPlayoffResult {
-  id: string;
-  points: number;
-  wins: number;
-  losses: number;
-  draws: number;
-}

+interface StoredFinaleMatch {
+  iteration: number;
+  aId: string;
+  bId: string;
+  scoreA: number;
+  scoreB: number;
+  votesA: number;
+  votesB: number;
+  judges: string[];
+}
```

Update `createInitialState()`, [serializeState()](file:///c:/Users/Myren/programming/Draftbench/state.ts#155-170), [deserializeState()](file:///c:/Users/Myren/programming/Draftbench/state.ts#171-211), and Zod schemas.

---

### Output & Leaderboard

#### [MODIFY] [leaderboard.ts](file:///c:/Users/Myren/programming/Draftbench/leaderboard.ts)

1. Remove [PlayoffResult](file:///c:/Users/Myren/programming/Draftbench/leaderboard.ts#47-53) type
2. Remove playoff columns from leaderboard output
3. Final ranking now based purely on rating (with CI display)
4. Update [computeLeaderboard()](file:///c:/Users/Myren/programming/Draftbench/leaderboard.ts#208-232) signature and logic
5. Update markdown formatting

New leaderboard output will show:
```markdown
| Rank | Revision | Rating | 95% CI | Swiss Pts |
|------|----------|--------|--------|-----------|
| 1 | Claude→GPT→Claude | 1623 | [1589, 1657] | 12 |
| 2 | GPT→Claude→GPT | 1601 | [1567, 1635] | 11 |
```

---

#### [MODIFY] [index.ts](file:///c:/Users/Myren/programming/Draftbench/index.ts)

1. Replace [runPlayoffPhase](file:///c:/Users/Myren/programming/Draftbench/phases/playoff.ts#32-350) import with `runFinalePhase`
2. Update phase orchestration
3. Update directory creation (`finale_judgments/` instead of `playoff_judgments/`)
4. Update log file (`finale_rounds.md` instead of `playoff_rounds.md`)
5. Update summary stats output

---

### Files to Delete (Cleanup)

| File | Lines | Reason |
|------|-------|--------|
| [phases/playoff.ts](file:///c:/Users/Myren/programming/Draftbench/phases/playoff.ts) | 350 | Replaced by `phases/finale.ts` |
| [scheduling/disambiguation.ts](file:///c:/Users/Myren/programming/Draftbench/scheduling/disambiguation.ts) | 92 | Logic merged into `scheduling/activeRanking.ts` |

---

### Files to Modify

| File | Changes |
|------|---------|
| [config.ts](file:///c:/Users/Myren/programming/Draftbench/config.ts) | Rename role, remove playoffSize, new finale config |
| [config.default.toml](file:///c:/Users/Myren/programming/Draftbench/config.default.toml) | Update config structure |
| [config.example.toml](file:///c:/Users/Myren/programming/Draftbench/config.example.toml) | Update examples |
| [config.1v1-swiss.toml](file:///c:/Users/Myren/programming/Draftbench/config.1v1-swiss.toml) | Update preset |
| [config.toml](file:///c:/Users/Myren/programming/Draftbench/config.toml) | Update user config |
| [state.ts](file:///c:/Users/Myren/programming/Draftbench/state.ts) | New finale state types, remove playoff types |
| [leaderboard.ts](file:///c:/Users/Myren/programming/Draftbench/leaderboard.ts) | Rating-only leaderboard, remove playoff columns |
| [index.ts](file:///c:/Users/Myren/programming/Draftbench/index.ts) | Replace playoff phase with finale phase |
| [utils.ts](file:///c:/Users/Myren/programming/Draftbench/utils.ts) | Update dry-run output |
| [phases/swiss.ts](file:///c:/Users/Myren/programming/Draftbench/phases/swiss.ts) | Remove inline disambiguation |
| [agents.md](file:///c:/Users/Myren/programming/Draftbench/agents.md) | Update documentation |
| [claude.md](file:///c:/Users/Myren/programming/Draftbench/claude.md) | Update documentation |
| [README.md](file:///c:/Users/Myren/programming/Draftbench/README.md) | Update quick start |

---

### Test Updates

| Test File | Changes |
|-----------|---------|
| [tests/config.test.ts](file:///c:/Users/Myren/programming/Draftbench/tests/config.test.ts) | Update role tests, add finale config tests |
| [tests/state.test.ts](file:///c:/Users/Myren/programming/Draftbench/tests/state.test.ts) | Replace playoff state tests with finale tests |
| [tests/leaderboard.test.ts](file:///c:/Users/Myren/programming/Draftbench/tests/leaderboard.test.ts) | Remove playoff tests, add rating-only tests |
| [tests/leaderboard.extended.test.ts](file:///c:/Users/Myren/programming/Draftbench/tests/leaderboard.extended.test.ts) | Same as above |
| [tests/disambiguation.planner.test.ts](file:///c:/Users/Myren/programming/Draftbench/tests/disambiguation.planner.test.ts) | Rename to `activeRanking.test.ts`, expand coverage |

---

## Verification Plan

### Automated Tests

1. **Unit Tests** (existing + new):
   ```bash
   # Run full test suite
   bun test
   ```
   All 276+ tests should pass after updates.

2. **Specific Test Files**:
   ```bash
   # New active ranking tests
   bun test tests/activeRanking.test.ts
   
   # Updated state tests
   bun test tests/state.test.ts
   
   # Updated leaderboard tests
   bun test tests/leaderboard.test.ts
   ```

3. **Lint Check**:
   ```bash
   bun run lint
   ```

### Integration Testing

1. **Dry Run**:
   ```bash
   bun run index.ts --dry-run
   ```
   - Verify console output shows "Finale" instead of "Playoff"
   - Verify finale iterations logged
   - Verify no errors

2. **Full Run (Optional - costs ~$15-20 in API)**:
   ```bash
   bun run index.ts --config config.example.toml
   ```
   - Verify `runs/<timestamp>/finale_rounds.md` created
   - Verify `runs/<timestamp>/finale_judgments/` populated
   - Verify `runs/<timestamp>/leaderboard.md` shows rating-based ranking
   - Verify no `playoff_rounds.md` or `playoff_judgments/` created

### Manual Verification

1. **Config Migration**:
   - Copy old config with `playoffJudges`
   - Run pipeline
   - Verify warning about deprecated key
   - Verify it still works (with fallback)

2. **Resume Functionality**:
   - Start a run
   - Interrupt mid-finale (Ctrl+C)
   - Resume with `--resume`
   - Verify it picks up from where it left off
