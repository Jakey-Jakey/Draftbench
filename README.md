# auto-draftify

An AI-powered D&D 5e statblock benchmark using cross-model generation, review, and revision with Swiss tournament judging.

## Overview

This pipeline benchmarks AI models on creating D&D 5th Edition monster statblocks:

1. **Generate**: 3 models (Claude, GPT, Gemini) each create a Doctor Doom statblock
2. **Review**: Each model reviews all 3 statblocks (9 reviews total)
3. **Revise**: All 3 models revise each statblock based on each review (27 revisions)
4. **Swiss Tournament**: 7 rounds of 1v1v1 judging to rank all 27 revisions
5. **Playoff**: Top-8 Round Robin with dual-judge voting for final rankings

## Features

- **1v1v1 Format**: Each Swiss match compares 3 statblocks simultaneously for 3× data efficiency
- **Position Randomization**: All matches randomize presentation order to eliminate position bias
- **Dual-Judge Playoff**: Claude (low thinking) + GPT 5.2 (high thinking) vote on each match
- **Anonymized Judging**: All statblocks are presented with anonymous IDs (S1, S2, S3)
- **Incremental Writes**: Results are written immediately as they complete
- **~97% Accuracy**: Optimized for high ranking accuracy through judge diversity

## Setup

```bash
bun install
```

## Configuration

Set the `OPENROUTER_API_KEY` environment variable:

```bash
export OPENROUTER_API_KEY=your_api_key_here
```

Or create a `.env` file:

```
OPENROUTER_API_KEY=your_api_key_here
```

## Usage

```bash
bun run index.ts
```

## Output Structure

Each run creates a timestamped directory in `runs/`:

```
runs/YYYY-MM-DDTHH-MM-SS/
├── claude_original.md       # Original statblock from Claude
├── gpt_original.md          # Original statblock from GPT
├── gemini_original.md       # Original statblock from Gemini
├── reviews/                 # 9 cross-review files
│   ├── claude_reviews_claude.md
│   ├── claude_reviews_gpt.md
│   └── ...
├── revisions/               # 27 revised statblocks
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

