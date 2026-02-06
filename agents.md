# Project Intelligence: Draftbench

## 🎯 Purpose
**Draftbench** benchmarks AI models on creative artifact generation (default: D&D 5e Statblocks). It runs a full **Generate → Review → Revise → Tournament** cycle to evaluate models' ability to create, critique, and improve content.

---

## 🏗️ Pipeline Phases

| Phase | Description | Default Config |
|-------|-------------|----------------|
| **1. Generate** | Each model creates initial drafts. | `initialGenerations: 1` |
| **2. Initial Leaderboard** | *(Optional)* Per-model pairwise to pick best seed. | `style: per-model-pairwise` |
| **3. Review** | Cross-review: each model reviews all selected drafts (including self). | 9 reviews (3×3) |
| **4. Revise** | All models revise each draft based on each review. | 27 revisions (3 seeds × 3 reviewers × 3 revisers) |
| **5. Swiss Tournament** | Configurable `1v1` or `1v1v1` Swiss system ranks revisions. | 7 rounds, Claude (low) judge |
| **6. Playoff** | Top-N Round Robin with multi-judge voting. | Top-8, Claude (low) + GPT (medium) |

---

## 📂 Key Files

### Core
| File | Purpose |
|------|---------|
| `index.ts` | **Entry point**. Thin orchestrator that imports and runs phases. |
| `config.ts` | Type definitions, defaults, config loading/merging, CLI parsing. |
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
| `phases/playoff.ts` | Phase 6: Top-N Round Robin playoff with resume checkpoints per matchup. |

### Utilities
| File | Purpose |
|------|---------|
| `utils.ts` | Shared utilities: directory creation, timestamps, shuffle, dry-run helpers. |
| `leaderboard.ts` | Leaderboard computation and Swiss/Playoff type definitions. |

### Configuration Files
| File | Purpose |
|------|---------|
| `config.toml` | **Main config**. User customizations (edit this). |
| `config.default.toml` | Reference: all defaults with full documentation. |
| `config.example.toml` | Example config with comments. |
| `config.1v1-swiss.toml` | Preset: Swiss 1v1 format (pairwise matches). |
| `config.draft-leaderboard.toml` | Preset: 3 generations + initial leaderboard enabled. |
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
3. Internal defaults in `config.ts`

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

# Swiss Tournament Judge
[roles.swissJudge]
model = "anthropic/claude-opus-4.5"
effort = "low"

# Playoff Judges (multi-judge voting)
[[roles.playoffJudges]]
model = "anthropic/claude-opus-4.5"
effort = "low"

[[roles.playoffJudges]]
model = "openai/gpt-5.2"
effort = "medium"

[tournament]
initialGenerations = 1
swissRounds = 7
playoffSize = 8
swissFormat = "1v1v1"  # "1v1" or "1v1v1"

[tournament.initialLeaderboard]
enabled = false
style = "per-model-pairwise"  # See styles below

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

### Initial Leaderboard Styles

When `initialGenerations > 1` and `initialLeaderboard.enabled = true`, choose how the best draft per model is selected:

| Style | Description | API Calls (3 models × 5 drafts) |
|-------|-------------|--------------------------------|
| `per-model-pairwise` | Each model's drafts compete internally (default) | 30 |
| `global-pairwise` | All drafts compete in one tournament | 105 |
| `per-model-rank` | Single ranking call per model | 3 |
| `global-rank` | Single ranking call for all drafts | 1 |

```toml
[tournament.initialLeaderboard]
enabled = true
style = "per-model-pairwise"  # Recommended for balance of cost and quality
```

### Swiss Match Format

```toml
[tournament]
swissFormat = "1v1v1"  # Default: three-way ranking (2/1/0 points)
# swissFormat = "1v1"  # Alternative: pairwise matches
```

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
```

---

## 📂 Output Structure

```
runs/<timestamp>/
├── <generator-token>_original_<n>.md
├── reviews/
│   └── <reviewer-token>_reviews_<reviewed-token>.md
├── revisions/
│   └── <generator-token>_<reviewer-token>_<reviser-token>.md
├── swiss_judgments/              # Detailed per-match reasoning
├── playoff_judgments/
├── initial_leaderboard/          # (If enabled)
├── swiss_rounds.md               # Round-by-round log
├── playoff_rounds.md             # Multi-judge voting log
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
6. **Resumability**: Reviews/revisions save incrementally, Swiss saves each round, and playoffs save each completed matchup.
7. **Linting**: Use `bun run lint` to check for code style and potential errors using Biome.
8. **Testing**: Use `bun test` to run the full suite.

---

## 🧠 Design Principles

- **Anonymization**: All judging uses opaque IDs (`S1`, `S2`, `S3`) to prevent model-name bias.
- **Randomization**: Presentation order is shuffled for every match.
- **Multi-Judge Playoff**: Playoff supports multiple judges to reduce single-model bias.
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
