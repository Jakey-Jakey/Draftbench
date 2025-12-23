# Draftbench

An AI-powered artifact benchmark that asks multiple models to create, review, and refine creative artifacts—essays, short stories, game statblocks, and more—before ranking the results with Swiss tournament judging.

## Overview

This pipeline benchmarks AI models on creating arbitrary artifacts end-to-end:

1. **Generate**: 3 models (Claude, GPT, Gemini) each create an artifact from the same brief (defaults to a D&D statblock)
2. **Review**: Each model reviews all 3 artifacts (9 reviews total)
3. **Revise**: All 3 models revise each artifact based on each review (27 revisions)
4. **Swiss Tournament**: 7 rounds of 1v1v1 judging to rank all 27 revisions
5. **Playoff**: Top-8 Round Robin with dual-judge voting for final rankings

## Features

- **1v1v1 Format**: Each Swiss match compares 3 artifacts simultaneously for 3× data efficiency
- **Position Randomization**: All matches randomize presentation order to eliminate position bias
- **Dual-Judge Playoff**: Claude (low thinking) + GPT 5.2 (high thinking) vote on each match
- **Anonymized Judging**: All artifacts are presented with anonymous IDs (S1, S2, S3)
- **Incremental Writes**: Results are written immediately as they complete
- **~97% Accuracy**: Optimized for high ranking accuracy through judge diversity

## Prerequisites

- [Bun](https://bun.sh/) runtime installed (used for scripts and package management)
- An [OpenRouter](https://openrouter.ai/) API key with access to the configured models

## Setup

Install dependencies with Bun:

```bash
bun install
```

## Configuration

Authentication is provided via the `OPENROUTER_API_KEY` environment variable. You can export
it directly or place it in a `.env` file:

```bash
export OPENROUTER_API_KEY=your_api_key_here
```

Run-time settings can be customized with a JSON config file. The pipeline loads `config.json`
by default and merges it with [`config.default.json`](./config.default.json). A test variant
is available in [`config.test.json`](./config.test.json). You can point to an alternate file
with `--config`:

```bash
bun run index.ts --config path/to/override.json
```

Key configuration knobs include:

- **models**: Override provider slugs or reasoning effort per model.
- **tournament**: Adjust Swiss round count or playoff size.
- **output**: Change the destination for generated run folders.
- **prompts**: Swap in custom system prompts or user templates to change the artifact type (essay, short story, D&D statblock, etc.).

## Usage

Run the full pipeline:

```bash
bun run index.ts
```

To test the flow without writing files or making API calls, use dry-run mode:

```bash
bun run index.ts --dry-run
```

## Output Structure

Each run creates a timestamped directory in `runs/`:

```
runs/YYYY-MM-DDTHH-MM-SS/
├── claude_original.md       # Original artifact from Claude
├── gpt_original.md          # Original artifact from GPT
├── gemini_original.md       # Original artifact from Gemini
├── reviews/                 # 9 cross-review files
│   ├── claude_reviews_claude.md
│   ├── claude_reviews_gpt.md
│   └── ...
├── revisions/               # 27 revised artifacts
│   ├── claude_claude_claude.md  # generator_reviewer_reviser
│   └── ...
├── swiss_rounds.md          # Swiss tournament log
├── playoff_rounds.md        # Top-8 Round Robin log (dual-judge votes)
└── leaderboard.md           # Final rankings
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

## Scoring

### Swiss Rounds (1v1v1)
- 1st place: 2 points
- 2nd place: 1 point
- 3rd place: 0 points
- Positions are randomized each match

### Playoff (Dual-Judge Round Robin)
- **Claude (low thinking)** + **GPT 5.2 (high thinking)** judge each match
- Both agree (2-0): 1 point to winner
- Disagree (1-1): 0.5 points each (draw)
- Positions are randomized each match

---

This project was created using `bun init`. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

