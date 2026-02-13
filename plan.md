# Draftbench Priority Plan

This plan focuses on the three highest-priority issues:

1. `#10` Missing integration coverage
2. `#1` Over-centralized `config.ts`
3. `#6` Tight coupling to global config

The sequence is intentional: add safety nets first (`#10`), then refactor config internals (`#1`), then remove global config coupling (`#6`) with lower risk.

---

## 1) High Priority: `#10` Integration Coverage Blind Spots

### Goals
- Add end-to-end confidence for the full pipeline flow.
- Verify resume behavior in realistic scenarios.
- Assert migration/deprecation warnings behavior.

### Checklist
- [ ] Add `test:integration` script in `package.json`.
- [ ] Create `tests/integration/` directory and base helpers (temp run dir, test config writer, cleanup).
- [ ] Add a full dry-run pipeline test:
  - [ ] Run `index.ts --dry-run` with a tiny config.
  - [ ] Assert run directory creation.
  - [ ] Assert `leaderboard.md` and `summary.json` exist and contain expected keys/markers.
- [ ] Add a resume integration test:
  - [ ] Seed an in-progress state.
  - [ ] Run `index.ts --resume <dir> --dry-run`.
  - [ ] Assert phases resume/skip correctly and outputs are still valid.
- [ ] Add migration warning test(s):
  - [ ] Use configs containing deprecated keys (`swissRounds`, `playoffSize`, etc.).
  - [ ] Spy/stub warning output and assert expected warning text patterns.
- [ ] Add CI-friendly guardrails:
  - [ ] Keep integration tests small/fast.
  - [ ] Use deterministic seeds/config so tests are stable.

### Acceptance Criteria
- [ ] `bun run test` remains green.
- [ ] `bun run test:integration` passes locally.
- [ ] At least one test validates end-to-end output generation.
- [ ] At least one test validates resume flow.
- [ ] At least one test validates deprecated-key warning emission.

---

## 2) High Priority: `#1` Over-Centralized `config.ts`

### Goals
- Split `config.ts` responsibilities into focused modules.
- Preserve behavior and compatibility while improving maintainability.

### Target Structure
- `config/types.ts` (interfaces/types only)
- `config/defaults.ts` (default config object)
- `config/loader.ts` (TOML parse + migration + merge orchestration)
- `config/validator.ts` (normalize + validate)
- `config/context.ts` (runtime config lifecycle access)
- `config/args.ts` (CLI arg parsing)
- `config/index.ts` (public exports/backward-compatible facade)

### Checklist
- [ ] Create `config/` folder and move type definitions to `config/types.ts`.
- [ ] Move defaults to `config/defaults.ts`.
- [ ] Extract TOML parse/migration logic into `config/loader.ts`.
- [ ] Extract normalization + validation to `config/validator.ts`.
- [ ] Extract `parseArgs` to `config/args.ts`.
- [ ] Implement a temporary compatibility facade in `config/index.ts`:
  - [ ] Keep current export surface to avoid broad breakage.
  - [ ] Re-export existing helpers (`getRoleEntries`, `getSwissJudges`, etc.) while internals are split.
- [ ] Update imports across repo from `../config` to the new facade path as needed.
- [ ] Run and fix tests after each extraction step (small commits/steps).

### Acceptance Criteria
- [ ] No single config module has mixed responsibilities comparable to current `config.ts`.
- [ ] Existing config tests continue to pass.
- [ ] Deprecated key behavior and warnings remain functionally equivalent.
- [ ] External behavior (`loadConfig`, helper getters, CLI parsing) unchanged for users.

---

## 3) High Priority: `#6` Global Config Coupling in Phases

### Goals
- Make phase dependencies explicit.
- Remove hidden runtime dependency on global `getConfig()` inside phase execution.
- Enable easier isolated testing and potential multi-run usage in-process.

### Checklist
- [ ] Define a `PipelineContext` (or similar) object built in `index.ts` from loaded config.
- [ ] Update phase signatures to accept explicit config slices:
  - [ ] `runGeneratePhase(..., generateConfig)`
  - [ ] `runInitialLeaderboardPhase(..., firstDraftSelectionConfig, judgeConfig)`
  - [ ] `runReviewPhase(..., reviewerConfig)`
  - [ ] `runRevisePhase(..., reviserConfig)`
  - [ ] `runSwissPhase(..., swissConfig, ratingConfig, schedulingConfig, stopRulesConfig)`
  - [ ] `runFinalePhase(..., finaleConfig, stopRulesConfig, ratingConfig, schedulingConfig)`
- [ ] Replace internal `getConfig()` calls in phase modules with args/context.
- [ ] Keep config helpers pure where possible (no implicit global reads).
- [ ] Minimize breakage via staged migration:
  - [ ] Stage 1: accept new params but keep temporary fallback for compatibility.
  - [ ] Stage 2: remove fallback/global reads once all call sites are updated.
- [ ] Add/adjust tests to construct phase inputs directly without global config setup.

### Acceptance Criteria
- [ ] Core phase modules no longer call `getConfig()` directly.
- [ ] `index.ts` is the primary composition root for config wiring.
- [ ] Phase-level tests can run with explicit config objects only.
- [ ] Pipeline behavior remains unchanged in normal CLI usage.

---

## Suggested Execution Order

- [ ] Step A: Implement `#10` integration tests first (safety net).
- [ ] Step B: Refactor config internals for `#1` behind compatibility exports.
- [ ] Step C: Decouple phase config dependencies for `#6`.
- [ ] Step D: Run full unit + integration suite and fix regressions.
- [ ] Step E: Update docs (`README.md`/`agents.md`) with testing and architecture notes after code lands.

