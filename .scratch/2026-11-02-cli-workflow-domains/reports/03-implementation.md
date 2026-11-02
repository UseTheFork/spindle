# Ticket 03 implementation report

Status: DONE

## Checkout and snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `813210223ec9c8c1d20b6d900f51dae6fb90021d`
- Final revision: `813210223ec9c8c1d20b6d900f51dae6fb90021d` (no commit authorized)
- Starting worktree already contained the controller's edit adding
  `Execution: implementing` to the ticket. I preserved it and did not edit the
  ticket.
- Tested code snapshot: the same HEAD plus the new untracked
  `tests/packaged-cli.test.ts` and deletion of
  `.github/scripts/utils/common.cjs`. The report was added after the test run.
- Final dirty/untracked state: deleted
  `.github/scripts/utils/common.cjs`; untracked
  `tests/packaged-cli.test.ts`; untracked this report; pre-existing modified
  `.scratch/2026-11-02-cli-workflow-domains/issues/03-packaged-workflow-migration.md`
  from the controller. No other changes.

## Criteria, changes, and evidence

- Added subprocess smoke tests that copy the existing built CLI and package
  manifest to a temporary package directory outside the checkout, then run that
  CLI against separate temporary target projects. The package directory has no
  `src` or checkout-local scripts; installed runtime dependencies are provided
  through a `node_modules` symlink.
- SDD coverage asserts exact JSON output with and without `--round`, confirms
  the optional scoped report appears only with a round, and verifies no report
  files or Git checkout state are changed.
- Setup coverage verifies all four setup defaults against the packaged template
  assets, exact initial result output, preservation on repeat, and operation in
  a non-Git project without `.github/spindle.json` or prior initialization.
- Help/discovery coverage exercises top-level help, `sdd` help,
  `sdd workspace` help, and setup help. It also checks both workflow commands
  and their help fail with the existing Just installation guidance when Just
  is absent, without target-project or Git side effects.
- Invalid-argument coverage checks missing values, unknown and duplicate
  options, inapplicable options, and invalid nesting for both command families;
  failures must use the `spindle:` error form and emit no stdout.
- Removed the shared CJS utility after a repository-wide caller search found
  no active imports or references. The active guidance audit found direct
  Spindle invocation and no references to retired helper entry points.
  The local and shipped setup-project Skills contain no duplicate bootstrap
  templates and both have version `1.1.0`. Historical `.scratch` evidence was
  preserved.
- No production behavior change was needed: the workflow implementations were
  already present from dependencies 01/02. This work adds packaged behavioral
  coverage and removes the unused utility; no compatibility alias was added.

## Checks

- `just test::test tests/packaged-cli.test.ts` — PASS, 3 tests, 0 failures,
  freshly run after the utility removal.
- The first smoke run had 2 passing tests and one test assertion failure
  because its URL regex omitted the existing `/en/` segment in Just's install
  URL. The assertion was corrected to match the actual guidance URL, and the
  fresh run above passed.
- The test used the existing `build/` output copied outside the checkout; I did
  not run a build. The test does not execute a freshly installed dependency
  tree: it uses the checkout's installed runtime dependencies via symlink.

## Pending controller checks and concerns

- Pending with the controller: formatting, lint, type checking, the full test
  suite, fresh build/package verification, ticket-wide CLI checks, and
  unchanged `init`/`update` regression verification. These were not scheduled
  for this worker and are not implementer failures.
- Project tooling documentation reports no build Just recipe. The controller
  owns the fresh build/package check and should use its approved project
  tooling.
- No other self-review findings or remaining implementation concerns.

## Hand-back

Packaged workflow smoke coverage passes on the reported snapshot; the unused
shared CJS utility is removed. No commit was made. Controller-wide checks remain
pending.
