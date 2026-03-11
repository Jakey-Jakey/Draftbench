# Config Migration

Draftbench still accepts several older config keys and section names for backward compatibility. New documentation and new config files should use the canonical names below.

## Canonical Names

- `[[roles.coarseJudges]]`
- `[[roles.fineJudges]]`
- `[[roles.firstDraftSelectionJudges]]`
- `tournament.coarseRounds`
- `tournament.coarseFormat`
- `[tournament.firstDraftSelection]`
- `[tournament.fineRanking]`

## Old to New Mapping

| Older name | Canonical name |
| --- | --- |
| `[[roles.swissJudges]]` | `[[roles.coarseJudges]]` |
| `[[roles.finaleJudges]]` | `[[roles.fineJudges]]` |
| `[[roles.playoffJudges]]` | `[[roles.fineJudges]]` |
| `[[roles.initialLeaderboardJudges]]` | `[[roles.firstDraftSelectionJudges]]` |
| `tournament.swissRounds` | `tournament.coarseRounds` |
| `tournament.swissFormat` | `tournament.coarseFormat` |
| `[tournament.initialLeaderboard]` | `[tournament.firstDraftSelection]` |
| `tournament.initialGenerations` | `tournament.firstDraftSelection.initialGenerations` |
| `[tournament.finale]` | `[tournament.fineRanking]` |
| `[tournament.disambiguation]` | `[tournament.fineRanking]` |
| `tournament.playoffSize` | `tournament.stopRules.topK` |

## Compatibility Behavior

- If both old and new forms are present, the loader prefers the canonical public form.
- The loader emits warnings when deprecated names are used.
- Older internal naming may still appear in code, state fields, and helper function names.

## Unsupported Older Forms

These should be treated as broken, not merely deprecated:

- `roles.swissJudge`

## Recommended Upgrade Pattern

1. Rename old keys to their canonical equivalents.
2. Move `tournament.initialGenerations` into `[tournament.firstDraftSelection]`.
3. Replace fine-stage `finale` or `disambiguation` sections with `[tournament.fineRanking]`.
4. Re-run a dry run and check that only canonical names remain in your config.
