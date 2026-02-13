# Project Intelligence: Draftbench

## 🎯 Purpose
**Draftbench** benchmarks AI models on creative artifact generation (default: D&D 5e Statblocks). It runs a full **Generate → Review → Revise → Tournament** cycle to evaluate models' ability to create, critique, and improve content.

---

## 🏗️ Pipeline Phases

| Phase | Description | Default Config |
|-------|-------------|----------------|
| **1. Generate** | Each model creates initial drafts. | `firstDraftSelection.initialGenerations: 1` |
| **2. First Draft Selection** | *(Optional)* Per-model pairwise to pick best draft per model. | `style: per-model-pairwise` |
| **3. Review** | Cross-review: each model reviews all selected drafts (including self). | 9 reviews (3×3) |
| **4. Revise** | All models revise each draft based on each review. | 27 revisions (3 seeds × 3 reviewers × 3 revisers) |
| **5. Coarse Ranking (Swiss Rounds)** | Configurable `1v1` or `1v1v1` Swiss system ranks revisions. | 7 rounds, configurable Swiss judges |
| **6. Fine Ranking (Top-K Refinement Matches)** | Active-learning pairwise to confidently rank the top-K. | Variable matches (budget-capped), multi-judge voting |

---

## 📂 Key Files

### Core

| File | Purpose |
|------|---------|
| `index.ts` | **Entry point**. Thin orchestrator that imports and runs phases. |
| `config.ts` | Backward-compatible facade that re-exports from `config/index.ts`. |
| `config/` | Split config modules: `types.ts`, `defaults.ts`, `loader.ts`, `validator.ts`, `context.ts`, `args.ts`, `index.ts`. |
| `aiClient.ts` | OpenRouter integration. API calls, prompt interpolation, JSON response parsing. |
| `state.ts` | Pipeline state management for resume functionality. |
| `schemas.ts` | Zod schemas for LLM response validation. |

### Phase Modules (`phases/`)

| File | Purpose |
|------|---------|
| `phases/generate.ts` | Phase 1: Generate initial statblocks from all models. |
| `phases/initialLeaderboard.ts` | Phase 2: Optional round robin to select best draft per model. |
| `phases/review.ts` | Phase 3: Cross-review statblocks (including self-review). |
| `phases/revise.ts` | Phase 4: Revise statblocks based on reviews. |
| `phases/swiss.ts` | Phase 5: Swiss tournament (`1v1` or `1v1v1`) with resume checkpoints per round. |
| `phases/finale.ts` | Phase 6: Fine ranking (active learning) with resume checkpoints per iteration. |

### Utilities

| File | Purpose |
|------|---------|
| `utils.ts` | Shared utilities: directory creation, timestamps, shuffle, dry-run helpers. |
| `leaderboard.ts` | Leaderboard computation and coarse/fine ranking type definitions. |
| `rating/engine.ts` | Elo and Bradley-Terry rating backend used by Swiss standings. BT supports L2 regularization, Newton/MM step sizes, and Hessian-based CIs. |
| `rating/convert.ts` | Converts Swiss match outcomes into pairwise observations for rating updates. |
| `scheduling/adaptive.ts` | Adaptive pair scheduler for Swiss `1v1`. Supports Fisher-information-based scoring. |
| `scheduling/activeRanking.ts` | Active-learning planner for selecting informative fine ranking matchups. Supports Fisher-information-based pair scoring. |
| `scheduling/stopRules.ts` | Confidence/stability stop-rule evaluator for early Swiss termination. |

### Configuration Files

| File | Purpose |
|------|---------|
| `config.toml` | **Main config**. User customizations (edit this). |
| `config.default.toml` | Reference: all defaults with full documentation. |
| `config.example.toml` | Example config with comments. |
| `config.1v1-swiss.toml` | Preset: Swiss 1v1 format (pairwise matches). |
| `config.draft-leaderboard.toml` | Preset: 3 generations + First Draft Selection enabled. |
| `prompts.toml` | Customizable prompts. Load with `--prompts` flag. |

### Tests

| File | Purpose |
|------|---------|
| `tests/config.test.ts` | Config loading, CLI parsing, prompts tests. |
| `tests/utils.test.ts` | Helper function tests. |
| `tests/swiss.test.ts` | Swiss pairing algorithm tests. |

---


## ⚙️ Configuration System

**Format**: TOML (supports comments with `#`)

**Priority Order** (highest first):
1. `--config <path>` CLI argument
2. `config.toml` (project root)
3. Internal defaults in `config/defaults.ts`

### Role-Centric Configuration

Models are defined **per role** with their settings. This makes it easy to:
- Use different models for different roles
- Set reasoning effort per model per role
- Have asymmetric setups (e.g., 2 generators, 5 reviewers)

```toml
# config.toml - Example with comments

[roles]
# Generators: Models that create initial drafts
[[roles.generators]]
model = "anthropic/claude-opus-4.5"
effort = "high"

[[roles.generators]]
model = "openai/gpt-5.2"
effort = "high"

[[roles.generators]]
model = "google/gemini-3-pro-preview"
effort = "high"

# Reviewers: Models that critique drafts
[[roles.reviewers]]
model = "anthropic/claude-opus-4.5"
effort = "medium"

[[roles.reviewers]]
model = "openai/gpt-5.2"
effort = "medium"

# Revisers: Models that improve drafts based on feedback
[[roles.revisers]]
model = "anthropic/claude-opus-4.5"
effort = "high"

# Coarse Ranking Judges (Swiss)
[[roles.coarseJudges]]
model = "anthropic/claude-opus-4.5"
effort = "low"

# Fine Ranking Judges (multi-judge voting)
[[roles.fineJudges]]
model = "anthropic/claude-opus-4.5"
effort = "low"

[[roles.fineJudges]]
model = "openai/gpt-5.2"
effort = "medium"

[tournament]
coarseRounds = 7
coarseFormat = "1v1v1"  # "1v1" or "1v1v1"

[tournament.firstDraftSelection]
enabled = false
style = "per-model-pairwise"  # See styles below
initialGenerations = 1

[tournament.rating]
enabled = true
backend = "elo"  # "elo" or "bradley-terry"
btRegularization = 0.01  # L2 regularization for BT (0 = disabled)
btUseNewton = true  # Per-player Hessian step sizes for BT
ciMode = "hessian"  # "bootstrap", "hessian" (analytic, BT only), or "normal"

[tournament.scheduling]
mode = "adaptive"  # "adaptive" or "static"
scoringMode = "fisher"  # "heuristic" or "fisher"

[tournament.stopRules]
enabled = true
minBatches = 3
maxBatches = 7
topK = 8
minSeparation = 65 # Set to 0 to disable separation check
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
maxParallel = 5  # Limit parallel API calls

[output]
runsDirectory = "runs"
```

### Role Entry Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | string | *required* | OpenRouter slug (e.g., `"anthropic/claude-sonnet-4"`) |
| `effort` | string | `"high"` | Reasoning effort: `"xhigh"`, `"high"`, `"medium"`, `"low"`, `"minimal"`, `"none"`. Optional. |
| `temperature` | number | *none* | Optional temperature override |

### First Draft Selection Styles

When `tournament.firstDraftSelection.initialGenerations > 1` and `tournament.firstDraftSelection.enabled = true`, choose how the best draft per model is selected:

| Style | Description | API Calls (3 models × 5 drafts) |
|-------|-------------|--------------------------------|
| `per-model-pairwise` | Each model's drafts compete internally (default) | 30 |
| `global-pairwise` | All drafts compete in one tournament | 105 |
| `per-model-rank` | Single ranking call per model | 3 |
| `global-rank` | Single ranking call for all drafts | 1 |

```toml
[tournament.firstDraftSelection]
enabled = true
style = "per-model-pairwise"  # Recommended for balance of cost and quality
initialGenerations = 3
```

### Swiss Match Format

```toml
[tournament]
coarseFormat = "1v1v1"  # Default: three-way ranking (2/1/0 points)
# coarseFormat = "1v1"  # Alternative: pairwise matches
```

### Rating, Scheduling, Coarse Early Stop Rules, and Fine Ranking

```toml
[tournament.rating]
enabled = true
backend = "elo"

[tournament.scheduling]
mode = "adaptive"
exploration = 0.15
avoidRepeatPenalty = 0.35
maxRepeatPairs = 2

[tournament.stopRules]
enabled = true
minBatches = 3
maxBatches = 7
topK = 8

[tournament.fineRanking]
enabled = true
maxMatchesPerBatch = 4
maxTotalMatches = 30
targetWinProb = 0.5
confidence = 0.9
minSeparation = 0
allowOverRepeatCap = false
```

- `rating.enabled`: when true, coarse standings use rating estimates instead of raw points.
- `rating.btRegularization`: L2 penalty strength for the Bradley-Terry backend; shrinks player parameters toward the mean to reduce noise from sparse observations (0 = disabled).
- `rating.btUseNewton`: when true, uses per-player Hessian-diagonal (Newton/MM) step sizes instead of a fixed learning rate, converging significantly faster.
- `rating.ciMode`: selects confidence interval computation: `"bootstrap"` (resample-based), `"hessian"` (analytic from BT log-likelihood Hessian, `O(history)` instead of `O(samples * iters * history)`), or `"normal"` (`z * uncertainty` fallback).
- `scheduling.mode = "adaptive"`: prioritizes uncertain/close matchups and penalizes repeats (for `1v1` Swiss).
- `scheduling.scoringMode`: `"heuristic"` uses the original composite score (uncertainty + closeness + coverage); `"fisher"` uses Fisher information `p*(1-p)` weighted by combined uncertainty, which is the statistically optimal measure of expected information gain from a pairwise comparison.
- `stopRules.enabled`: allows coarse ranking to stop early once top-K is stable and sufficiently separated/confident.
- `fineRanking.enabled`: after coarse ranking, runs targeted pairwise matches among the top-K to separate adjacent confidence intervals (budget-capped).

---

## 🏷️ Naming Conventions

### Revision IDs
Format: `{generatorToken}_{reviewerToken}_{reviserToken}`
- Token format: `<short-model-name>-<8hexhash>` (deterministic from full model slug)
- Example: `gpt-5-2-a1b2c3d4_claude-opus-4-5-e5f6a7b8_gemini-3-pro-preview-11223344`

### Anonymous Judging IDs
During tournaments, revisions are presented as `S1`, `S2`, `S3` to prevent bias.

---

## 💻 CLI Reference

```bash
# Full run
bun run index.ts

# Dry run (mock data, no API calls, no file writes)
bun run index.ts --dry-run

# Custom config
bun run index.ts --config config.1v1-swiss.toml

# Custom prompts (for different benchmarks)
bun run index.ts --prompts my-prompts.toml

# Combined
bun run index.ts --config my-config.toml --prompts my-prompts.toml --dry-run

# Resume interrupted run
bun run index.ts --resume runs/2024-01-01T12-00-00

# Linting
bun run lint

# Testing
bun test
bun run test:integration
```

---

## 📂 Output Structure

```text
runs/<timestamp>/
├── <generator-token>_original_<n>.md
├── reviews/
│   └── <reviewer-token>_reviews_<reviewed-token>.md
├── revisions/
│   └── <generator-token>_<reviewer-token>_<reviser-token>.md
├── initial_leaderboard/          # (If enabled)
├── coarse/
│   ├── rounds/                   # round-by-round coarse log (one file per round)
│   ├── standings/                # per-round rating snapshots (md + json)
│   └── judgments/                # per-match coarse judge outputs
├── fine/
│   ├── iterations/               # iteration-by-iteration fine log (one file per iteration)
│   ├── standings/                # per-iteration rating snapshots (md + json)
│   └── judgments/                # per-match fine judge outputs
├── leaderboard.md                # Final rankings & stats
└── state.json                    # Resume checkpoint state
```

---

## ⚠️ Common Pitfalls & Development Notes

1. **Missing API Key**: Set `OPENROUTER_API_KEY` env var before running.
2. **Config Not Loading**: Ensure valid TOML syntax. Run `bun test` to validate.
3. **Adding Models**: Use full OpenRouter slugs (e.g., `anthropic/claude-sonnet-4`).
4. **Prompt Templates**: Use `{varname}` syntax. Available vars depend on phase (see `prompts.toml`).
5. **Cost Control**: Use `--dry-run` liberally. Full runs cost ~$15-20 in API calls.
6. **Resumability**: Reviews/revisions save incrementally, Swiss saves each round, and the finale saves each iteration.
7. **Linting**: Use `bun run lint` to check for code style and potential errors using Biome.
8. **Testing**: Use `bun test` to run the full suite.

---

## 🧠 Design Principles

- **Anonymization**: All judging uses opaque IDs (`S1`, `S2`, `S3`) to prevent model-name bias.
- **Randomization**: Presentation order is shuffled for every match.
- **Multi-Judge Coarse/Fine**: Both tournament stages support multiple judges to reduce single-model bias.
- **Incremental I/O**: Results are persisted immediately to handle crashes gracefully.

---

## 🧪 Test Coverage

The test suite now includes comprehensive coverage for:

### New Test Files
- `tests/callSettings.test.ts` - Tests for the new callSettings module (effort/temperature resolution)
- `tests/semaphore.test.ts` - Tests for the new concurrency limiter
- `tests/state.test.ts` - Tests for state management and persistence
- `tests/leaderboard.test.ts` - Tests for leaderboard computation and ranking logic

### Enhanced Existing Tests
- `tests/config.test.ts` - Added TOML parsing, role configuration, prompt interpolation tests
- `tests/swiss.test.ts` - Added pairwise pairing, opponent tracking, edge case tests
- `tests/utils.test.ts` - Added timestamp, directory management, mock generation tests

### Test Statistics
- **Total Test Files**: 11
- **Test Suites**: 50+
- **Individual Tests**: 276
- **Coverage Areas**: Config loading, TOML parsing, concurrency control, state persistence, tournament logic, leaderboard computation, utility functions

Run tests with:
```bash
bun test
```

Run specific test file:
```bash
bun test tests/semaphore.test.ts
```

---
