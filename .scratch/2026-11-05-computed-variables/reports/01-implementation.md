# Ticket 01 Implementation Report

Status: `DONE`

## Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `32d9990474201df337ebdab1d1550cd05cb4772b`
- Final revision: `32d9990474201df337ebdab1d1550cd05cb4772b` (no commit; not authorized)
- Exact tested snapshot: the implementation and test changes listed below at the starting revision; the controller-owned issue tracker edit was present throughout and preserved. The final affected test run completed after the last source change. This report was written after verification.
- Starting dirty state: only the controller-owned edit to `.scratch/2026-11-05-computed-variables/issues/01-computed-variable-generation.md`.
- Final worker changes: `src/computed.ts`, `src/blueprints/lifecycle.ts`, `src/render.ts`, `src/version.ts`, `tests/computed-variables.test.ts`, `tests/rendering.test.ts`, `tests/packaged-cli.test.ts`, and `.scratch/2026-11-05-computed-variables/reports/01-implementation.md`.
- The controller-owned issue tracker change remains untouched. Build output and generated test projects did not appear as additional working-tree changes.

## Criteria, Changes, and Evidence

- Added the abstract `ComputedVariableProvider`, typed read-only `ResolvedConfig`, explicit public-name registry, and exact `internal_skill_description` provider in `src/computed.ts`.
- Wired computed resolution into the lazy per-reconciliation context resolver in `src/blueprints/lifecycle.ts`. It runs after init/update Config and Variable resolution, freezes provider-input Stack/Variable collections, caches one context per run, and reuses the computed values for version inspection and prepared writes. Separate reconciliations resolve afresh.
- Added `computed` to the render context and preserved it when versioned entries are rendered for version inspection in `src/render.ts` and `src/version.ts`.
- Strict undefined output still fails. Missing computed outputs now include the unresolved public name and retain the original renderer error as `cause`; the CRLF location regression is covered.
- Real CLI fixture-catalog tests cover successful init and update; parse generated frontmatter; inspect body/supporting-file output across Skills, Agents, and Instructions; verify Stack/Variable rendering and version metadata; and confirm computed values are absent from Config. A same-leaf Variable remains separate from the computed namespace.
- Update preparation-failure coverage plans creation, removal, and directory-membership cleanup, then verifies an unknown computed reference exits nonzero, identifies the missing name, and leaves Config and managed files byte-for-byte unchanged with no planned creation/removal applied.
- Provider-boundary tests derive output from resolved Config including product defaults, verify cached context reuse across render operations and fresh evaluation for a new run, and verify a throwing provider reports its registry name and original cause.
- The packaged-CLI test renders a computed Internal Skill description using a copied shipped Skill asset and runs from outside the checkout.
- Existing shipped description templates and author documentation were not migrated; those are explicitly assigned to ticket 02.
- Behavior changes followed RED→GREEN: init/update tests first failed on absent `computed`; the unknown-name case first failed with Nunjucks’ generic diagnostic while its unchanged-state assertions passed; the CRLF test first failed with the generic diagnostic and passed after the line-offset correction.

## Changed Files

- `src/computed.ts` — provider base, registry, resolution, cached context resolver.
- `src/blueprints/lifecycle.ts` — shared context resolution integration.
- `src/render.ts` — computed namespace contract and named undefined-output diagnostics.
- `src/version.ts` — computed values preserved for version inspection.
- `tests/computed-variables.test.ts` — CLI, transaction, provider-boundary, and package-independent behavior coverage.
- `tests/rendering.test.ts` — computed diagnostics including CRLF source.
- `tests/packaged-cli.test.ts` — packaged CLI computed rendering outside the checkout.
- `.scratch/2026-11-05-computed-variables/reports/01-implementation.md` — implementation evidence and hand-back.

## Checks

- `just test::types` — passed.
- `just build` — passed; provider code is emitted into the normal CLI build.
- `just test::test tests/computed-variables.test.ts tests/rendering.test.ts tests/init.test.ts tests/update.test.ts tests/coordinated-preparation.test.ts tests/install.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts` — passed, 80 tests, 0 failures.
- `just tool::git diff --check` — passed.
- Final `just test::test tests/computed-variables.test.ts` after strengthening the provider-failure assertion — passed, 5 tests, 0 failures; the subsequent final affected run also included this test.
- Not run by this worker: formatting, lint, and the complete ticket-wide regression suite. These remain pending with the controller; they are not implementer failures or evidence of ticket acceptance.

## Self-Review and Hand-Back

- Reviewed the lifecycle cache, provider contract, version-rendering context, strict missing-output handling, and scoped changes. The CRLF diagnostic issue found in self-review was fixed and covered.
- No known remaining implementation concerns. No execution states were changed, no unrelated work was altered, and no commit was made.
- Hand-back: ticket 01 implementation and focused verification are complete. Controller-owned formatting, lint, ticket-wide checks, and acceptance remain pending.

## Controller Verification Addendum

Exact implementation snapshot remains based on `32d9990474201df337ebdab1d1550cd05cb4772b`, with the source, tests, and controller-owned ticket/report changes listed above uncommitted. Controller formatting made formatter changes to the assigned ticket files and removed an unused test import; no behavior changes were made after the reported focused test run.

- `just format::check src/computed.ts src/blueprints/lifecycle.ts src/render.ts src/version.ts tests/computed-variables.test.ts tests/rendering.test.ts tests/packaged-cli.test.ts` — passed.
- `just lint::check src/computed.ts src/blueprints/lifecycle.ts src/render.ts src/version.ts tests/computed-variables.test.ts tests/rendering.test.ts tests/packaged-cli.test.ts` — passed.
- `just test::types` — passed.
- `just build` — passed as the first command in `just build && just test::test`.
- `just test::test` — passed, 175 tests, 0 failures.
- `just tool::git diff --check` — passed.

The original unformatted snapshot had one unused-import lint error; the controller applied the mechanical correction before these passing checks.

## Corrective Round 1 — CV-01

Status: `DONE`

### Snapshot and scope

- Checkout: `/home/sincore/source/spindle`.
- Starting and final revision: `32d9990474201df337ebdab1d1550cd05cb4772b`; no commit was authorized or made.
- Starting tracked changes: controller-owned issue `01-computed-variable-generation.md`, plus existing ticket implementation in `src/blueprints/lifecycle.ts`, `src/render.ts`, `src/version.ts`, `tests/packaged-cli.test.ts`, and `tests/rendering.test.ts`.
- Starting untracked changes: `src/computed.ts`, `tests/computed-variables.test.ts`, and report files under `.scratch/2026-11-05-computed-variables/reports/`. These remain present.
- Round-1 edits only: the diagnostic extraction regex in `src/render.ts`, one regression test in `tests/rendering.test.ts`, and this appended report section. Existing changes and report history were preserved; no tracker execution state or ticket 02 files were edited.
- Exact tested snapshot: the supplied dirty starting snapshot plus those two code/test edits, before this report append. No code/test changes followed GREEN. SHA-256 fingerprints:
  - `src/render.ts`: `b21833fe23c3c985c5e4064b54e36df680db3dddf2d95442e17410f35e286455`
  - `tests/rendering.test.ts`: `85f18045d59bf41058ec06535153a05da3af7ee65aea35ec9833335e01a769eb`
- Final dirty/untracked path set is unchanged from the supplied starting set; this report remains within the existing untracked reports directory.

### Finding, correction, and fresh evidence

- **CV-01:** quoted-bracket computed output names containing punctuation were omitted from strict undefined diagnostics. The extractor now accepts single- and double-quoted bracket keys without imposing the dot-notation identifier character restriction. The dot-notation rule and Nunjucks environment settings remain unchanged.
- Added `missing computed outputs name quoted bracket keys containing punctuation` at the approved `renderText` boundary. It checks both `{{ computed["missing-name"] }}` and `{{ computed['missing-name'] }}` throw a named unknown-computed-output error.
- **RED:** `just test::test tests/rendering.test.ts` from the checkout — exit 1, 14 passed / 1 failed. The new regression failed because the original generic Nunjucks undefined-output diagnostic did not identify `missing-name`.
- **GREEN:** the same command after the extractor correction — exit 0, 15 passed / 0 failed. Both quoted forms executed successfully in the regression. Existing strict undefined, CRLF diagnostic, raw-block, autoescape, Variable/Stack, and literal-text checks passed.
- This was a test-first behavior correction, not a pure refactor.

### Self-review and hand-back

- Reviewed the scoped diff and final worktree status through `just tool::git`. The round-1 change is limited to extracting bracket-key names after a renderer failure; it does not change successful rendering or suppress strict undefined failures.
- No remaining concerns identified for the assigned CV-01 case. No required implementer checks were unavailable or left failing.
- Not run in this round: formatting, lint, type checking, build, computed CLI integration, or ticket-wide regression checks. These remain controller-owned after the fix; earlier controller results above predate this correction and are not fresh evidence for it.
- Hand-back: CV-01 correction and focused RED→GREEN evidence are ready for controller review. Acceptance and execution-state transitions remain with the controller.

### Controller Verification Addendum

The scoped re-review snapshot remains based on `32d9990474201df337ebdab1d1550cd05cb4772b`, with the complete ticket implementation, corrective round, and `.scratch` reports uncommitted. Round 1 changed only the computed output diagnostic extraction and its regression test; no code or test changes followed the reported GREEN.

- `just format::check src/computed.ts src/blueprints/lifecycle.ts src/render.ts src/version.ts tests/computed-variables.test.ts tests/rendering.test.ts tests/packaged-cli.test.ts` — passed.
- `just lint::check` on the same files — passed.
- `just test::types` — passed.
- `just build` — passed.
- `just test::test` — passed, 176 tests, 0 failures.
- `just tool::git diff --check` — passed.
- `just test::test tests/rendering.test.ts` — round-1 RED: 14 passed, 1 failed on the new quoted-bracket regression; GREEN: 15 passed, 0 failed.
