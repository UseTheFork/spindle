# Retrospective — Remove Just Support

## 1. Summary

- **Reader skills:** The fresh reader loaded `int-domain-modeling` before assessing evidence and consulted `int-writing-instruction` for the supported instruction candidate.
- **Tickets:** Ticket 01 and ticket 02 are integrated; neither issue was closed.
- **Review rounds:** Ticket 01 had one corrective round. Ticket 02 had two ticket-level corrective rounds, then a third round for the aggregate findings. The aggregate code and code-slop reviews ran in parallel; the final scoped re-review cleared both assigned findings.
- **Elapsed intervals from ticket comments:** Ticket 01 start to initial integration was 20m42s; its corrective findings remained open 7m27s. Ticket 02 start to initial integration was 48m09s; `T02-INT-1` remained open 6m21s and `C02-1` 9m09s. The aggregate corrective round ran from 22:55:44Z to 23:16:03Z (20m19s). These are elapsed wall-clock intervals, not estimates of active work.
- **Limitations:** A package build was not run because no approved root build recipe exists. The no-op `before(async () => {})` at `tests/stubs.test.ts:34` remains as a nonblocking Minor review observation after the single full-spec corrective dispatch. The implementation snapshot passed controller checks: changed-file formatting, lint, types, diff check, developer-Just-path preservation, and the full test suite (163/163).
- **Verdict:** The delivered behavior meets the spec. The packaging cleanup remains statically reviewed rather than build-verified. Ticket 02 was returned to `integrated` at 23:16:03Z; no PR or closure action was taken.

## 2. Environment findings

### ENV-AUTO-01 — Missing approved package-build verification route

- **Category:** Automated checks
- **Severity:** Moderate
- **Evidence:** Ticket 02's `T02-INT-1` comment at 2026-11-03T22:24:27Z required cleanup of stale generated Just outputs while preserving the ignored build directory. The same comment and the final aggregate code review state that the package build was not run because the checkout has no usable approved root build recipe. `docs/agents/tooling.md` documents that limitation, while `package.json` defines a build script; a repository file listing found no tracked CI workflow.
- **Proposed change:** Establish an approved package-build command and a CI workflow that runs the supported project checks, including package build. For example, add an appropriate recipe to the developer Just modules, import it from the root `justfile`, document it in `docs/agents/tooling.md`, and invoke it in CI.
- **Target files:** Proposed `.github/workflows/ci.yml`, `justfile`, `.github/scripts/just-modules/`, and `docs/agents/tooling.md`.

### ENV-INST-01 — Stale Just-prerequisite testing example

- **Category:** Workspace instructions
- **Severity:** Minor
- **Evidence:** `.github/instructions/testing.instructions.md` includes an example test named “exits non-zero when just is missing.” Ticket 01's 2026-11-03T21:50:21Z comment records removing Just-prerequisite coverage; the final aggregate review confirms the CLI no longer has a Just prerequisite.
- **Proposed change:** Replace the obsolete example with one for a supported CLI behavior, such as malformed-command validation. See instruction proposal `INS-TEST-01`.
- **Target file:** `.github/instructions/testing.instructions.md`.

## 3. Domain findings

### Glossary drift

None. The root glossary at `GLOSSARY.md` contains no Just Module term; the spec also says the term had already been removed. `GLOSSARY-MAP.md` is absent.

### Undefined terms

None.

### ADR candidates

None. The changes update existing ADRs, but the evidence does not establish a new decision that is simultaneously hard to reverse, surprising without context, and the result of a meaningful trade-off.

## 4. Instruction suggestions

### INS-TEST-01 — Replace the obsolete Just-prerequisite example

- **Severity:** Minor
- **Evidence and durable gap:** `.github/instructions/testing.instructions.md` demonstrates a test for failure when Just is missing. Ticket 01's 2026-11-03T21:50:21Z comment required removing Just-prerequisite tests, and the final CLI no longer gates commands on Just. The instruction example now teaches behavior the product intentionally removed.
- **Operation and target:** Amend `.github/instructions/testing.instructions.md`. This file owns test-writing conventions and already applies to the relevant test files; a duplicate instruction is unnecessary.
- **Intended scope:** Keep `applyTo: "**/*.test.{ts,js,cjs,mjs}"` and the existing task-discovery description. The example applies across the test suite, so the existing scope is appropriate.
- **Proposed actionable change:** Replace the Just-missing example with a neutral supported CLI behavior, such as malformed-command validation, while retaining the `node:test` and strict-assertion conventions.
- **Expected benefit:** Test authors get an accurate example and are less likely to reintroduce coverage for a retired prerequisite.
- **Overlap/conflict checked:** `.github/instructions/testing.instructions.md` is the only applicable workspace instruction identified. Its runner and naming guidance does not conflict with this amendment.
- **Why guidance:** This is a stale behavioral example in a test-authoring instruction. A deterministic check for this exact wording would be brittle and could incorrectly flag valid tests of Just-related project behavior.
- **Follow-up validation:** Ask an agent to add a CLI regression test for malformed input. Success means the test follows the existing runner/assertion conventions and does not infer a Just prerequisite from the instruction. Discovery or adherence was not tested in this retrospective.

## 5. Open questions

- Who owns approving a root package-build recipe and adding it to CI, given that `package.json` defines a build script but the documented root tooling has no usable build command?
- The final scoped re-review retained `before(async () => {})` at `tests/stubs.test.ts:34` as a nonblocking Minor issue. The controller left it unchanged because the one authorized full-spec corrective dispatch was used; no further implementation round was authorized.
