# Draftbench

Draftbench runs a full generate-review-revise-ranking pipeline for creative artifacts. You can use it as a benchmark harness for comparing models, or as a quality-first workflow for producing a strong final artifact by forcing multiple passes through critique and revision.

The project ships with D&D 5e statblocks as the default benchmark, but the prompts and configuration are designed so you can run the same workflow on other artifact types such as essays, product specs, fiction, or design documents.

## Who It Is For

- People who want to run the benchmark and compare models on a full artifact workflow
- People who want a fairly inefficient but often high-quality way to produce a final artifact
- Users who want reusable run outputs, resumability, and artifact files they can actually inspect or use

## Pipeline

1. Generate initial drafts from each generator model.
2. Optionally run First Draft Selection to choose the best seed per generator.
3. Review every selected draft with every reviewer, including self-review.
4. Revise every draft against every review.
5. Run coarse ranking with Swiss-style judging.
6. Run fine ranking on the top-K using active-learning pairwise matches.

## Quickstart

### Prerequisites

- [Bun](https://bun.sh/)
- An [OpenRouter](https://openrouter.ai/) API key with access to the models in your config

### Install

```bash
bun install
```

### Set Your API Key

Bun auto-loads `.env` files, so either export the variable or place it in a local `.env`:

```bash
export OPENROUTER_API_KEY=your_api_key_here
```

### Run a Dry Run First

```bash
bun run index.ts --dry-run
```

### Run the Default Benchmark

```bash
bun run index.ts
```

## Minimal Config Example

Public docs use the canonical config names below: `coarseJudges`, `fineJudges`, `firstDraftSelection`, `coarseRounds`, `coarseFormat`, and `fineRanking`.

```toml
[roles]

[[roles.generators]]
model = "openai/gpt-5.2"
effort = "high"

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
coarseRounds = 5
coarseFormat = "1v1"

[tournament.firstDraftSelection]
enabled = false
initialGenerations = 1

[tournament.fineRanking]
enabled = true
maxMatchesPerBatch = 4
maxTotalMatches = 20

[output]
runsDirectory = "runs"
```

For the full schema and examples, see [docs/configuration.md](./docs/configuration.md). If you are migrating from older config names, see [docs/config-migration.md](./docs/config-migration.md).

## CLI

```bash
# Default run
bun run index.ts

# Dry run
bun run index.ts --dry-run

# Custom config
bun run index.ts --config config.1v1-swiss.toml

# Custom prompts
bun run index.ts --prompts prompts.toml

# Resume an interrupted run
bun run index.ts --resume runs/<timestamp>

# Reuse earlier artifacts and rerun ranking only
bun run index.ts --reuse-artifacts runs/<timestamp>

# Reuse artifacts and skip coarse ranking
bun run index.ts --reuse-artifacts runs/<timestamp> --skip-coarse

# Reuse artifacts and skip fine ranking
bun run index.ts --reuse-artifacts runs/<timestamp> --skip-fine
```

## Output Overview

Each run writes a timestamped directory under `runs/` with:

- original generations
- `reviews/` and `revisions/`
- `initial_leaderboard/` when First Draft Selection is enabled
- `coarse/` with round logs, standings, and judgments
- `fine/` with iteration logs, standings, and judgments
- `leaderboard.md`, `summary.json`, `summary.detailed.json`, and `state.json`

Dry runs also write `DRY_RUN.md`. Resumed legacy runs may keep older `swiss_*` and `finale_*` paths instead of the newer `coarse/` and `fine/` layout.

## Documentation

- [docs/getting-started.md](./docs/getting-started.md)
- [docs/configuration.md](./docs/configuration.md)
- [docs/pipeline-and-ranking.md](./docs/pipeline-and-ranking.md)
- [docs/runs-and-recovery.md](./docs/runs-and-recovery.md)
- [docs/troubleshooting.md](./docs/troubleshooting.md)
- [docs/config-migration.md](./docs/config-migration.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)

## Development

```bash
bun test
bun run test:integration
bun run lint
```

## Attribution

Draftbench began as a fork of `auto-draftify` by Theo Browne. The project has since evolved into a more general benchmark pipeline for creative artifact generation and ranking.
