# Getting Started

This guide is the fastest path from a fresh checkout to a useful Draftbench run, whether you are benchmarking models or trying to get a strong final artifact out of a multi-pass workflow.

## Prerequisites

- [Bun](https://bun.sh/)
- An [OpenRouter](https://openrouter.ai/) API key
- Access to the model slugs configured in `config.toml` or your custom config

## Install

```bash
bun install
```

## Configure Credentials

Bun auto-loads `.env` files. Add your key to a local `.env` or export it in your shell:

```bash
export OPENROUTER_API_KEY=your_api_key_here
```

## Start With a Dry Run

Dry runs exercise the full pipeline shape without making API calls or writing real benchmark artifacts.

```bash
bun run index.ts --dry-run
```

What to expect:

- console output showing the loaded config and estimated API volume
- a run directory under `runs/`
- mock outputs including `leaderboard.md`, `summary.json`, `state.json`, and `DRY_RUN.md`

## Run the Default Benchmark

The default prompts generate and rank D&D 5e monster statblocks. That makes the default setup useful both for benchmarking and for actually producing a statblock you may want to keep.

```bash
bun run index.ts
```

What to expect:

- generated drafts in the run root
- review files in `reviews/`
- revised artifacts in `revisions/`
- ranking outputs in `coarse/` and `fine/`
- final summaries in `leaderboard.md`, `summary.json`, and `summary.detailed.json`

## Use a Custom Config

```bash
bun run index.ts --config config.custom.toml
```

The config loader merges your file over built-in defaults. Canonical public config names are documented in [configuration.md](./configuration.md).

## Use Custom Prompts

```bash
bun run index.ts --prompts prompts.toml
```

Prompt overrides let you keep the tournament logic while targeting a different artifact type. The shipped default is D&D-specific, but the pipeline itself is artifact-agnostic.

## Cost Expectations

Cost depends on:

- the number of generators, reviewers, revisers, and judges
- `initialGenerations`
- coarse rounds and judge count
- fine ranking match budget
- each model's pricing and reasoning effort

Draftbench prints an estimated API call count when it loads config. Treat that as the first cost sanity check before running paid benchmarks.

## Recommended First Steps

1. Run `--dry-run`.
2. Read [configuration.md](./configuration.md) and cut the model set down to a small cheap benchmark.
3. Do one paid run with your target prompts.
4. Use [runs-and-recovery.md](./runs-and-recovery.md) if the run is interrupted or you want to reuse earlier artifacts.
