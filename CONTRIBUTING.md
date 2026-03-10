# Contributing

## Development Commands

```bash
bun install
bun test
bun run test:integration
bun run lint
```

Use `bun run index.ts --dry-run` when you want to sanity-check pipeline flow without API costs.

## Repo Layout

- `index.ts`: top-level pipeline orchestration
- `config/`: config types, loading, validation, defaults, and CLI argument parsing
- `phases/`: generate, first-draft-selection, review, revise, coarse ranking, and fine ranking
- `rating/`: Elo and Bradley-Terry logic
- `scheduling/`: adaptive coarse and fine matchup selection
- `report/`: run summary generation
- `tests/`: unit and integration coverage
- `docs/`: canonical user-facing documentation

## Documentation Rules

- `README.md` is the landing page, not the full reference.
- `docs/` is the canonical home for user-facing configuration and pipeline docs.
- `agents.md` and `CLAUDE.md` should stay thin and should not duplicate product documentation.
- Public docs should use canonical public names such as `coarseJudges`, `fineJudges`, `firstDraftSelection`, `coarseRounds`, and `fineRanking`.
- Legacy internal names may still exist in code for compatibility. Document them only in migration or contributor-facing contexts.

## Keep These in Sync

When you change behavior, check whether these need updates together:

- `config/defaults.ts`
- `config.default.toml`
- `config.example.toml`
- `prompts.toml`
- tests under `tests/`
- user docs in `README.md` and `docs/`

Typical examples:

- adding a config field means updating loader, validator, defaults, examples, and docs
- changing CLI flags means updating `config/args.ts`, tests, README examples, and troubleshooting guidance
- changing output layout or resume semantics means updating `index.ts`, state tests, and `docs/runs-and-recovery.md`

## Docs Change Standard

Prefer behavior-level documentation over repeating internal implementation details. The goal is that a new user can configure and run Draftbench from the docs without reading the source.
