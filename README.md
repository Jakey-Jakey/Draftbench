# Draftbench

An AI-powered artifact benchmark that asks multiple models to create, review, and refine creative artifacts—essays, short stories, game statblocks, and more—before ranking the results with Swiss tournament judging.

## Overview

This pipeline benchmarks AI models on creative artifact generation end-to-end:

1. **Generate**: Multiple models each create an artifact from the same brief
2. **Review**: Each model reviews all generated artifacts
3. **Revise**: All models revise each artifact based on each review
4. **Swiss Tournament**: 7 rounds of 1v1v1 judging to rank all revisions
5. **Playoff**: Top-8 Round Robin with multi-judge voting for final rankings

## Features

- **1v1v1 Format**: Each Swiss match compares 3 artifacts simultaneously for 3× data efficiency
- **Position Randomization**: All matches randomize presentation order to eliminate position bias
- **Multi-Judge Playoff**: Configurable judges vote on each playoff match
- **Anonymized Judging**: All artifacts are presented with anonymous IDs (S1, S2, S3)
- **Resumable Runs**: Interrupted pipelines can be resumed with `--resume`
- **Incremental Writes**: Results are written immediately as they complete

## Prerequisites

- [Bun](https://bun.sh/) runtime installed
- An [OpenRouter](https://openrouter.ai/) API key with access to the configured models

## Setup

```bash
bun install
```

## Configuration

### API Key

Set the `OPENROUTER_API_KEY` environment variable (Bun auto-loads `.env` files):

```bash
export OPENROUTER_API_KEY=your_api_key_here
```

### Config Files (TOML)

The pipeline uses TOML configuration with this priority:

1. `--config <path>` CLI flag (highest priority)
2. `config.toml` in project root
3. Built-in defaults in `config.ts`

Reference files:
- [`config.default.toml`](./config.default.toml) — All defaults with documentation
- [`config.example.toml`](./config.example.toml) — Commented example

### Role-Centric Schema

Models are assigned to specific roles rather than globally:

```toml
[roles]
generators = [
  { model = "anthropic/claude-sonnet-4", effort = "high" },
  { model = "openai/gpt-4.1", effort = "high" },
  { model = "google/gemini-2.5-pro", effort = "high" },
]
reviewers = [...]  # Can reuse or specify different models
revisers = [...]

[roles.swissJudge]
model = "anthropic/claude-sonnet-4"
effort = "low"

[[roles.playoffJudges]]
model = "anthropic/claude-sonnet-4"
effort = "low"
```

### Custom Prompts

Override prompts via a separate TOML file:

```bash
bun run index.ts --prompts my-prompts.toml
```

See [`prompts.toml`](./prompts.toml) for the default prompt templates.

### Customization

To tailor Draftbench for your own artifact types:

1. Copy `config.default.toml` and modify the `[prompts]` section
2. Or create a `prompts.toml` file and use `--prompts prompts.toml`
3. Ask an LLM to generate a config—describe what you want to benchmark

See [`agents.md`](./agents.md) for full schema reference.

## Usage

```bash
# Run full pipeline
bun run index.ts

# Dry run (no API calls, no file writes)
bun run index.ts --dry-run

# Custom config
bun run index.ts --config config.1v1-swiss.toml

# Custom prompts
bun run index.ts --prompts my-prompts.toml

# Resume interrupted run
bun run index.ts --resume runs/<timestamp>
```

## Development

```bash
# Run tests
bun test

# Lint
bun run lint

# Lint with auto-fix
bun x @biomejs/biome check --write
```

## Output Structure

Each run creates a timestamped directory in `runs/`:

```
runs/YYYY-MM-DDTHH-MM-SS/
├── *_original.md            # Original artifacts from each generator
├── reviews/                 # Cross-review files
│   └── <reviewer>_reviews_<generator>.md
├── revisions/               # Revised artifacts
│   └── <generator>_<reviewer>_<reviser>.md
├── swiss_rounds.md          # Swiss tournament log
├── playoff_rounds.md        # Playoff round robin log
├── leaderboard.md           # Final rankings
└── state.json               # Pipeline state (for resume)
```

## Cost Estimate

| Phase | API Calls | Est. Cost |
|-------|-----------|-----------|
| Generate | 3 | ~$0.50 |
| Review | 9 | ~$1.00 |
| Revise | 27 | ~$2.00 |
| Swiss (7 rounds × 9) | 63 | ~$5.67 |
| Playoff (28 × 2 judges) | 56 | ~$5.80 |
| **Total** | **158** | **~$15** |

*Costs vary based on model selection and reasoning effort.*

## Scoring

### Swiss Rounds (1v1v1)
- 1st place: 2 points
- 2nd place: 1 point
- 3rd place: 0 points
- Positions are randomized each match

### Playoff (Multi-Judge Round Robin)
- Configurable judges vote on each match
- Both agree (2-0): 1 point to winner
- Disagree (1-1): 0.5 points each (draw)
- Positions are randomized each match

---

Built with [Bun](https://bun.sh).
