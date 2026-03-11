# Runs and Recovery

Draftbench is built to survive interruptions and to let you reuse earlier work.

## Structured Run Layout

New runs default to a structured output layout:

```text
runs/<timestamp>/
├── <generator-token>_original_<n>.md
├── reviews/
├── revisions/
├── initial_leaderboard/
│   └── leaderboard.md
├── coarse/
│   ├── rounds/
│   ├── standings/
│   └── judgments/
├── fine/
│   ├── iterations/
│   ├── standings/
│   └── judgments/
├── leaderboard.md
├── summary.json
├── summary.detailed.json
└── state.json
```

Dry runs also create `DRY_RUN.md`.

## Legacy Layout on Resume

If you resume an older run that already used legacy output paths, Draftbench preserves that layout instead of splitting one run across two formats.

Legacy paths may include:

- `swiss_rounds.md`
- `swiss_judgments/`
- `finale_rounds.md`
- `finale_judgments/`

## `state.json`

`state.json` is the resume checkpoint for the pipeline. It tracks:

- completed phases
- generated drafts
- selected drafts
- reviews
- revisions
- coarse match history and contestant state
- fine match history and convergence state

If `state.json` is missing or invalid, `--resume` cannot continue the run.

## Resume an Interrupted Run

```bash
bun run index.ts --resume runs/<timestamp>
```

Use this when a run was interrupted and you want to continue the same run directory.

## Reuse Earlier Artifacts

```bash
bun run index.ts --reuse-artifacts runs/<timestamp>
```

Use this when you want a new run directory that reuses previously completed artifact-generation work.

Requirements:

- the source run must already have completed `generate`
- the source run must already have completed `initial_leaderboard`
- the source run must already have completed `review`
- the source run must already have completed `revise`

Draftbench copies reusable artifacts into a fresh run and continues from there. This gate is based on the phase-2 checkpoint name in state, not on whether `tournament.firstDraftSelection.enabled` was turned on. Runs with `initialGenerations = 1` still complete the `initial_leaderboard` phase.

## Skip Flags

Skip flags only work together with `--reuse-artifacts`.

```bash
bun run index.ts --reuse-artifacts runs/<timestamp> --skip-coarse
bun run index.ts --reuse-artifacts runs/<timestamp> --skip-fine
```

Behavior:

- `--skip-coarse` requires the source run to have already completed coarse ranking
- `--skip-fine` disables fine ranking in the new run
- `--resume` and `--reuse-artifacts` cannot be used together

## Summary Files

- `leaderboard.md`: human-readable final standings
- `summary.json`: compact machine-readable run summary
- `summary.detailed.json`: detailed post-run summary written for non-dry runs

If you only need a quick programmatic overview, start with `summary.json`.
