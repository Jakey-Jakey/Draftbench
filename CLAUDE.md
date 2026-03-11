---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to Bun.

- Use `bun <file>` instead of `node <file>`.
- Use `bun install` instead of package-manager alternatives.
- Use `bun test` for tests.
- Use `bun run lint` for linting.

Draftbench's canonical user-facing documentation lives in:

- [`README.md`](./README.md)
- [`docs/getting-started.md`](./docs/getting-started.md)
- [`docs/configuration.md`](./docs/configuration.md)
- [`docs/pipeline-and-ranking.md`](./docs/pipeline-and-ranking.md)
- [`docs/runs-and-recovery.md`](./docs/runs-and-recovery.md)
- [`docs/troubleshooting.md`](./docs/troubleshooting.md)
- [`docs/config-migration.md`](./docs/config-migration.md)

Agent guidance for this repo:

- Run the benchmark with `bun run index.ts`.
- Use `bun run index.ts --dry-run` before expensive runs.
- Use `bun run index.ts --resume runs/<timestamp>` to resume.
- Use `bun run index.ts --reuse-artifacts runs/<timestamp>` to rerun ranking from prior artifacts.
- Keep public docs on canonical names such as `coarseJudges`, `fineJudges`, `firstDraftSelection`, `coarseRounds`, and `fineRanking`.
- Avoid duplicating product documentation in agent-specific files.
