# Draftbench Agent Notes

This file is for coding agents working in the repository. Product and configuration documentation lives in the canonical human docs:

- [`README.md`](./README.md)
- [`docs/getting-started.md`](./docs/getting-started.md)
- [`docs/configuration.md`](./docs/configuration.md)
- [`docs/pipeline-and-ranking.md`](./docs/pipeline-and-ranking.md)
- [`docs/runs-and-recovery.md`](./docs/runs-and-recovery.md)
- [`docs/troubleshooting.md`](./docs/troubleshooting.md)
- [`docs/config-migration.md`](./docs/config-migration.md)

## Runtime and Commands

- Use Bun, not Node or npm.
- Install with `bun install`.
- Run the pipeline with `bun run index.ts`.
- Use `bun run index.ts --dry-run` before expensive config changes.
- Run tests with `bun test`.
- Run integration tests with `bun run test:integration`.
- Run lint with `bun run lint`.

## Working Expectations

- Treat `README.md` and `docs/` as the canonical public docs.
- Keep agent-facing files thin; link to the canon instead of duplicating it.
- Public documentation should use canonical names such as `coarseJudges`, `fineJudges`, `firstDraftSelection`, `coarseRounds`, and `fineRanking`.
- Internal code may still use older `swiss` and `finale` naming. That is a compatibility detail, not the public vocabulary.

## High-Value Paths

- `index.ts`
- `config/`
- `phases/`
- `rating/`
- `scheduling/`
- `report/`
- `tests/`
