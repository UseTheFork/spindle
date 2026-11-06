# Ticket 05 review inputs

## Requirements

- Canonical spec: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/spec.md`
- Ticket and criteria: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/issues/05-installation-service-and-utilities.md`; comments section empty, no separate comments.
- Completed dependency: ticket 01; tickets 02, 03, and 04 are also integrated.
- Applicable project guidance: `/home/sincore/source/spindle/docs/agents/issue-tracker.md`, `/home/sincore/source/spindle/docs/agents/triage-labels.md`, `/home/sincore/source/spindle/docs/agents/domain.md`, `/home/sincore/source/spindle/docs/agents/tooling.md`, `/home/sincore/source/spindle/GLOSSARY.md`, `/home/sincore/source/spindle/docs/adr/0004-application-owned-services.md`, `/home/sincore/source/spindle/docs/adr/0001-blueprint-lifecycle.md`, `/home/sincore/source/spindle/docs/adr/0003-catalog-selected-blueprints.md`, and `/home/sincore/source/spindle/.github/instructions/testing.instructions.md`. `GLOSSARY-MAP.md` is absent.
- Scope: application-owned installation behavior and source roots, focused utilities, current consumers/imports, tests, and directly related docs. The ticket requires functionality independently of later command/reconciliation-class changes. No other ticket is part of this review.

## Workspace and snapshot

- Checkout: `/home/sincore/source/spindle`
- Base/HEAD: `d7235b417c6bdbb3806dbefd7dd4245414c8347c`; no commit created.
- The complete candidate is the uncommitted content in the shared checkout at this supplied base. Inspect the complete tracked diff, both deleted modules, and each added file and modified consumer/test listed below. No binary changes.
- Modified:
  - `docs/blueprints.md` — SHA-256 `262b054ba3feb3c7304a98a21cec4fd8ee56b1fd1511f2395ad65c1ffcad8776`
  - `src/blueprints/catalog.ts` — `3204303411f4b1b815e713d4e805adddb8821724197e8363f450c68015896dd5`
  - `src/cli.ts` — `2f2f5e0795c52a7f680104937ee0bca4c61b88faad16289292fff2f4e9e10f79`
  - `src/commands/init/init-command.ts` — `1000092f30990ab600e828726373b79f0047e3db44880f353d6ca8ffa73c5575`
  - `src/commands/update/update-command.ts` — `5d96dad6b6d3b2d8a99b9e38c3c59a980fe104d94b671ad6b31110f7796b7b4f`
  - `tests/install.test.ts` — `a5c4105a67e6ad0cefa4b870794e949152bd639d18cbb8db2bb3185f42b0f72e`
  - `tests/rendering.test.ts` — `c10578c85878596346b312ec9a55bcdf8b8006a9fb7708265ae6c86075e26ff3`
  - `tests/stubs.test.ts` — `a654dd554cd9b8b09c00f6c0fa66ef46a60685567ab757fdceefb03a00a42d33`
- Deleted: `src/blueprints/lifecycle.ts`, `src/install.ts`.
- Added:
  - `src/installation/installation-service.ts` — SHA-256 `7c24f0ba3448391b851c8b6014cf343a319dae69620f4cf3a9de5cbbaae77b2e`
  - `src/installation/types.ts` — `75b14e55f80aa64e8441463b3e513c3f7bfef50bbec17b0ab9222f87555cbe4f`
  - `src/utilities/blueprint-files.ts` — `d910868b99f08d86efcf6f39243710bde6ba61e67f8daa36d0c70549423cfb9c`
  - `src/utilities/blueprint-source-root.ts` — `b377d791d826ccd44c38c41b57e73fe780fb9d7a6280298ae1f2bfa90e1c0775`
  - `src/utilities/conflict-policy.ts` — `d65d880a0c6c6e5e02bf748834a71756f043e07693e948f57a75da60b33af6f9`
  - `src/utilities/stacks.ts` — `58f58559916d4b9c500bd8c378f593651cb1bd4eeffbcdc9177770d972797ce7`
- Tracked diff stat: 11 files changed, 118 insertions(+), 1133 deletions(-); six added source files are additional to the stat.
- Workflow-only excluded files: controller-owned ticket marker and reports in `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/`.
- No unrelated user changes were present at dispatch.

## Implementation summary and evidence

Implementation details and TDD evidence: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-implementation.md`.

The implementer used the pure-refactor path with 84 passing baseline tests; the additional App-isolation/repeated-operation test was written after migration and passed on its first run. No historical RED is claimed.

Controller-run on the final frozen source/test snapshot:

- `just format::check` on the changed docs, source, and tests — passed after mechanical formatting of seven files.
- `just lint::check` on the same files — passed.
- `just test::types` — passed.
- `just test::test tests/install.test.ts tests/init.test.ts tests/update.test.ts tests/rendering.test.ts tests/stubs.test.ts tests/catalog.test.ts tests/coordinated-preparation.test.ts tests/app.test.ts` — passed, 95 tests, 0 failures.
- `just build` — passed.
- `just test::test tests/packaged-cli.test.ts` — passed, 4 tests, 0 failures, after build.
- `just test::test` — passed, 198 tests, 0 failures, sequentially after build.
- `just tool::git diff --check` — passed.

The implementer's final focused command covered 85 tests; the controller added application API coverage for the current root/lifecycle changes, giving 95 tests on the final formatted candidate.
