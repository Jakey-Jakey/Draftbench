# Pipeline and Ranking

Draftbench evaluates models across a full artifact lifecycle rather than a single generation call, and that same lifecycle can also be used as a quality-first content production workflow.

## Phase 1: Generate

Each generator model creates `initialGenerations` drafts from the same prompt brief. By default the shipped prompts create D&D 5e statblocks, but the mechanism is general.

Output:

- root-level `*_original_<n>.md` files
- generation results stored in `state.json`

## Phase 2: First Draft Selection

If enabled, Draftbench narrows multiple seeds down to one selected draft per generator before review begins.

Selection modes:

- pairwise internal tournaments: `per-model-pairwise`
- global pairwise tournament: `global-pairwise`
- per-model ranking: `per-model-rank`
- global ranking across all drafts: `global-rank`

Example:

```toml
style = "per-model-pairwise"
```

Use `per-model-rank` when you want one ranking call per generator. Use `global-rank` when you want one ranking call across the entire seed pool.

If disabled, the generated draft set flows directly into review.

## Phase 3: Review

Every reviewer reviews every selected draft, including self-review.

Purpose:

- surface model-specific critique styles
- generate multiple review perspectives on each artifact
- provide the revision phase with explicit improvement inputs

Output:

- files in `reviews/`
- review records in `state.json`

## Phase 4: Revise

Each reviser revises every selected draft against every review, producing a larger candidate field for ranking.

Revision IDs are deterministic:

```text
{generatorToken}_{reviewerToken}_{reviserToken}
```

Each token uses a stable `<short-model-name>-<8hexhash>` form derived from the full model slug.

## Phase 5: Coarse Ranking

Coarse ranking is the Swiss stage. Public docs call this the coarse phase even though some internal code and compatibility layers still use `swiss` terminology.

### Match Formats

- `1v1`: pairwise judging
- `1v1v1`: three-way judging

### Judge Behavior

- one or more `coarseJudges` may evaluate each match
- artifacts are anonymized as `S1`, `S2`, and `S3`
- presentation order is shuffled to reduce positional bias

### Scoring

For `1v1v1`, the baseline point model is:

- first place: 2 points
- second place: 1 point
- third place: 0 points

When multi-judge voting produces ties, points can be split.

### Ratings

If `tournament.rating.enabled = true`, standings use the configured rating backend with uncertainty and confidence intervals. Raw points still remain useful as an intuitive summary.

Supported backends:

- Elo
- Bradley-Terry

### Scheduling

Static scheduling follows the base Swiss flow. Adaptive scheduling prioritizes close or uncertain matchups and discourages repeated pairs.

### Stop Rules

Coarse ranking can stop before `coarseRounds` if top-K stability and confidence conditions are met. The main controls are:

- `minBatches`
- `maxBatches`
- `topK`
- `minSeparation`
- `confidence`
- `stabilityBatches`

## Phase 6: Fine Ranking

Fine ranking starts after coarse ranking and focuses only on the top-K.

Behavior:

- selects pairwise matches expected to be most informative
- aims for roughly uncertain, near-50/50 comparisons
- uses one or more `fineJudges`
- stops when confidence targets are met or the match budget is exhausted

This stage depends on ratings being enabled.

## Bias Controls

The ranking pipeline uses several anti-bias mechanisms:

- opaque artifact IDs during judging
- randomized display order
- optional multi-judge voting in coarse and fine stages
- deterministic artifact IDs on disk for reproducibility without exposing model names during judging

## What the Rankings Mean

Draftbench is best viewed as a benchmark harness, not a proof of universal model quality. Final standings reflect:

- your prompt set
- your chosen roles and judges
- the artifact domain
- the run budget
- the ranking backend and stop configuration

For reproducible comparisons, keep prompts, config, and candidate models stable across runs.
