# Troubleshooting

## Missing `OPENROUTER_API_KEY`

Symptom:

- API-backed runs fail before model calls succeed

Fix:

- set `OPENROUTER_API_KEY`
- confirm Bun can read it from your shell or `.env`
- rerun with `--dry-run` first if you want to verify the pipeline shape without API calls

## TOML Parse Errors

Symptom:

- config loading fails with a parse error

Fix:

- validate brackets and array-of-table syntax such as `[[roles.generators]]`
- keep comments on their own line or after valid TOML values
- compare your file against `config.example.toml`

## Unknown or Deprecated Config Keys

Symptom:

- warnings during config load

Fix:

- switch to the canonical names documented in [configuration.md](./configuration.md)
- use [config-migration.md](./config-migration.md) to translate older names

Notes:

- the loader accepts several legacy aliases for compatibility
- some older singular forms are no longer supported at all, such as `roles.swissJudge`

## Invalid Model Slugs

Symptom:

- config validation fails or the provider rejects the model

Fix:

- use full OpenRouter slugs such as `openai/gpt-5.2`
- confirm the slug contains `/`
- confirm your OpenRouter account has access to the model

## Empty Judge Sets

Symptom:

- validation errors around coarse or fine judges

Fix:

- define at least one `roles.coarseJudges` entry
- when `tournament.fineRanking.enabled = true`, define at least one `roles.fineJudges` entry
- if you use pairwise First Draft Selection styles, define `roles.firstDraftSelectionJudges` or rely on the fine-judge fallback

## High Estimated API Volume

Symptom:

- Draftbench prints a surprisingly large API call estimate

Fix:

- reduce the number of generators, reviewers, revisers, or judges
- lower `coarseRounds`
- reduce `initialGenerations`
- lower `fineRanking.maxTotalMatches`
- use `--dry-run` after each config change to sanity-check the estimate

## Fine Ranking Does Not Run

Symptom:

- fine ranking is disabled unexpectedly

Fix:

- confirm `tournament.fineRanking.enabled = true`
- confirm `tournament.rating.enabled = true`
- confirm `roles.fineJudges` is non-empty

## Resume Fails

Symptom:

- `--resume` reports a missing or invalid run directory

Fix:

- pass the exact run path under `runs/`
- confirm the run contains a valid `state.json`
- use `--reuse-artifacts` instead if you want a new run that starts from prior artifacts
