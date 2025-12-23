# Project Intelligence: Draftbench

## 🎯 Purpose
**Draftbench** benchmarks AI models on creative artifact generation (default: D&D 5e Statblocks). It runs a full **Generate → Review → Revise → Tournament** cycle to evaluate models' ability to create, critique, and improve content.

---

## 🏗️ Pipeline Phases

| Phase | Description | Default Config |
|-------|-------------|----------------|
| **1. Generate** | Each model creates initial drafts. | `initialGenerations: 1` |
| **2. Initial Leaderboard** | *(Optional)* Round-robin to pick best seed per model. | `initialLeaderboard.enabled: false` |
| **3. Review** | Cross-review: each model reviews all selected drafts (including self). | 9 reviews (3×3) |
| **4. Revise** | All models revise each draft based on each review. | 27 revisions (3 seeds × 3 reviewers × 3 revisers) |
| **5. Swiss Tournament** | 1v1v1 Swiss system ranks revisions. | 7 rounds, Claude (low) judge |
| **6. Playoff** | Top-N Round Robin with dual-judge voting. | Top-8, Claude (low) + GPT (high) |

---

## � Key Files

| File | Purpose |
|------|---------|
| `index.ts` | **Entry point**. Pipeline orchestration, tournament logic, file I/O. |
| `config.ts` | Type definitions, defaults, config loading/merging, CLI parsing. |
| `aiClient.ts` | OpenRouter integration. API calls, prompt interpolation, JSON response parsing. |
| `config.json` | User overrides (gitignored). Merged with defaults at runtime. |
| `config.draft-leaderboard.json` | Pre-made config: 3 generations + initial leaderboard enabled. |

---

## ⚙️ Configuration System

**Priority Order** (highest first):
1. `--config <path>` CLI argument
2. `config.json` (project root)
3. Internal defaults in `config.ts`

### Critical Config Fields

```jsonc
{
  "models": {
    "claude": { "slug": "anthropic/claude-4.5-opus", "reasoningEffort": "high" }
    // Add/modify models here
  },
  "tournament": {
    "initialGenerations": 1,      // Drafts per model
    "initialLeaderboard": {
      "enabled": false,           // Enable seed selection
      "judges": []                // Empty = use playoffJudges
    },
    "swissRounds": 7,
    "playoffSize": 8,
    "swissJudge": { "model": "claude", "effort": "low" },
    "playoffJudges": [
      { "model": "claude", "effort": "low" },
      { "model": "gpt", "effort": "high" }
    ]
  },
  "prompts": {
    "generate": { "system": "...", "user": "..." },
    "review": { "system": "...", "userTemplate": "...{statblock}..." },
    "revise": { "system": "...", "userTemplate": "...{statblock}...{feedback}..." },
    "judgePairwise": { "system": "...", "userTemplate": "...{idA}...{textA}..." },
    "judgeThreeWay": { "system": "...", "userTemplate": "...{idA}...{idB}...{idC}..." }
  }
}
```

---

## 🏷️ Naming Conventions

### Revision IDs
Format: `{generator}_{reviewer}_{reviser}`
- Example: `claude_gpt_gemini` = Claude generated, GPT reviewed, Gemini revised.

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
bun run index.ts --config config.draft-leaderboard.json

# Combined
bun run index.ts --config my-config.json --dry-run
```

---

## 📂 Output Structure

```
runs/<timestamp>/
├── <model>_original_<n>.md       # Initial generations
├── reviews/
│   └── <reviewer>_reviews_<reviewed>.md
├── revisions/
│   └── <gen>_<rev>_<revi>.md     # The 27 tournament contestants
├── swiss_judgments/              # Detailed per-match reasoning
├── playoff_judgments/
├── initial_leaderboard/          # (If enabled)
├── swiss_rounds.md               # Round-by-round log
├── playoff_rounds.md             # Dual-judge voting log
└── leaderboard.md                # Final rankings & stats
```

---

## ⚠️ Common Pitfalls & Development Notes

1. **Missing API Key**: Set `OPENROUTER_API_KEY` env var before running.
2. **Config Not Loading**: Ensure valid JSON. Check for trailing commas.
3. **Adding Models**: New models must be added to `config.models` with a valid OpenRouter slug.
4. **Prompt Templates**: Use `{varname}` syntax. Available vars depend on phase (see `config.ts` types).
5. **Cost Control**: Use `--dry-run` liberally. Full runs cost ~$15-20 in API calls.
6. **Incremental Writes**: Files are written as each phase completes—safe to interrupt and resume manually.

---

## 🧠 Design Principles

- **Anonymization**: All judging uses opaque IDs (`S1`, `S2`, `S3`) to prevent model-name bias.
- **Randomization**: Presentation order is shuffled for every match.
- **Dual Judging**: Playoff uses two judges with different reasoning efforts to reduce single-model bias.
- **Incremental I/O**: Results are persisted immediately to handle crashes gracefully.
