# Configuration

Draftbench uses TOML configuration. The canonical public names in this document are:

- `[[roles.coarseJudges]]`
- `[[roles.fineJudges]]`
- `[[roles.firstDraftSelectionJudges]]`
- `tournament.coarseRounds`
- `tournament.coarseFormat`
- `[tournament.firstDraftSelection]`
- `[tournament.fineRanking]`

The config loader still accepts several older aliases for backward compatibility. Those are covered in [config-migration.md](./config-migration.md), but new examples should use only the canonical names above.

## Resolution Order

`config/index.ts` selects one effective config path and one effective prompts path.

For config:

- if you pass `--config <path>`, Draftbench reads that file
- otherwise it reads `config.toml` if present
- the selected file is merged over built-in defaults from `config/defaults.ts`

For prompts:

- if you pass `--prompts <path>`, Draftbench reads that file
- otherwise it reads `prompts.toml` if present
- the selected prompts file is merged over the prompt defaults in `config/defaults.ts`

The CLI flags do not layer multiple config files together. They replace the default file path that `config/index.ts` would otherwise load.

## Role Schema

Each role entry supports:

| Field | Type | Notes |
| --- | --- | --- |
| `model` | string | Required OpenRouter slug |
| `effort` | string | Optional reasoning effort: `xhigh`, `high`, `medium`, `low`, `minimal`, `none` |
| `temperature` | number | Optional per-role override |

Available roles:

- `roles.generators`
- `roles.reviewers`
- `roles.revisers`
- `roles.coarseJudges`
- `roles.fineJudges`
- `roles.firstDraftSelectionJudges` for pairwise first-draft-selection styles

## Canonical Example

```toml
[roles]

[[roles.generators]]
model = "openai/gpt-5.2"
effort = "high"

[[roles.generators]]
model = "anthropic/claude-opus-4.5"
effort = "high"

[[roles.reviewers]]
model = "openai/gpt-5.2"
effort = "medium"

[[roles.reviewers]]
model = "anthropic/claude-opus-4.5"
effort = "medium"

[[roles.revisers]]
model = "openai/gpt-5.2"
effort = "high"

[[roles.coarseJudges]]
model = "anthropic/claude-opus-4.5"
effort = "low"

[[roles.fineJudges]]
model = "openai/gpt-5.2"
effort = "medium"

[tournament]
coarseRounds = 7
coarseFormat = "1v1v1"

[tournament.firstDraftSelection]
enabled = false
initialGenerations = 1
style = "per-model-pairwise"

[tournament.rating]
enabled = true
backend = "elo"
kFactor = 24
initialRating = 1000
provisionalMatches = 5
tieValue = 0.5
btIterations = 200
btTolerance = 0.000001
ciBootstrapSamples = 200
btRegularization = 0.01
btUseNewton = true
ciMode = "hessian"

[tournament.scheduling]
mode = "adaptive"
exploration = 0.15
avoidRepeatPenalty = 0.35
maxRepeatPairs = 2
scoringMode = "fisher"

[tournament.stopRules]
enabled = true
minBatches = 3
maxBatches = 7
topK = 8
minSeparation = 65
confidence = 0.9
stabilityBatches = 2

[tournament.fineRanking]
enabled = true
maxMatchesPerBatch = 4
maxTotalMatches = 30
targetWinProb = 0.5
confidence = 0.9
minSeparation = 0
allowOverRepeatCap = false

[concurrency]
maxParallel = 5

[output]
runsDirectory = "runs"
```

## First Draft Selection

Use First Draft Selection when each generator creates more than one initial draft.

```toml
[tournament.firstDraftSelection]
enabled = true
initialGenerations = 3
style = "per-model-pairwise"
```

Supported styles:

| Style | Behavior |
| --- | --- |
| `per-model-pairwise` | Each model's own drafts compete pairwise |
| `global-pairwise` | All drafts compete pairwise |
| `per-model-rank` | One ranking call per generator |
| `global-rank` | One ranking call across all drafts |

Notes:

- Pairwise styles require at least one `roles.firstDraftSelectionJudges` entry, or they fall back to `roles.fineJudges`.
- `initialGenerations` must be at least `1`.
- If `enabled = false`, Draftbench still respects `initialGenerations = 1` as the normal baseline flow.

## Coarse Ranking

```toml
[tournament]
coarseRounds = 7
coarseFormat = "1v1v1"
```

- `coarseFormat` must be `1v1` or `1v1v1`
- `coarseRounds` must be an integer greater than or equal to `1`
- `roles.coarseJudges` must contain at least one judge

## Rating

```toml
[tournament.rating]
enabled = true
backend = "bradley-terry"
btRegularization = 0.01
btUseNewton = true
ciMode = "hessian"
```

Key options:

- `backend`: `elo` or `bradley-terry`
- `tieValue`: draw score in pairwise space
- `btRegularization`: L2 shrinkage for Bradley-Terry
- `btUseNewton`: per-player Hessian step sizes
- `ciMode`: `bootstrap`, `hessian`, or `normal`

## Scheduling and Stop Rules

```toml
[tournament.scheduling]
mode = "adaptive"
exploration = 0.15
avoidRepeatPenalty = 0.35
maxRepeatPairs = 2
scoringMode = "fisher"

[tournament.stopRules]
enabled = true
minBatches = 3
maxBatches = 7
topK = 8
minSeparation = 65
confidence = 0.9
stabilityBatches = 2
```

- `mode = "adaptive"` prioritizes informative coarse matches
- `scoringMode = "fisher"` uses Fisher-information-based pair scoring
- `maxBatches` is clamped to `coarseRounds`
- `minSeparation = 0` disables the separation threshold

## Fine Ranking

```toml
[tournament.fineRanking]
enabled = true
maxMatchesPerBatch = 4
maxTotalMatches = 30
targetWinProb = 0.5
confidence = 0.9
minSeparation = 0
allowOverRepeatCap = false
```

- Fine ranking refines the coarse top-K with pairwise active-learning matches
- It requires `tournament.rating.enabled = true`
- `roles.fineJudges` must be non-empty when enabled
- If `maxTotalMatches < maxMatchesPerBatch`, Draftbench clamps `maxMatchesPerBatch`

## Concurrency

```toml
[concurrency]
maxParallel = 5
```

- Omit `[concurrency]` or set `maxParallel = 0` for unlimited concurrency
- Lower values reduce API burstiness and rate-limit risk

## Prompt Overrides

Prompt overrides live in a separate TOML file passed with `--prompts`.

```bash
bun run index.ts --prompts prompts.toml
```

The default prompt sections are:

- `generate`
- `review`
- `revise`
- `judgePairwise`
- `judgeThreeWay`
- `judgeRank`

See the shipped `prompts.toml` for the exact fields.
