# 02: Migrate init to Commander

Reporter: unknown
Category: enhancement
Status: ready-for-agent
Execution: accepted

**What to build:** Make `spindle init` a Commander-backed command whose
class owns its declaration, retaining existing Blueprint installation and
configuration behavior.

**Blocked by:** 01: Introduce Commander through update.

- [X] `init` registers its own name, description, options, and action through its command class and explicitly selects applicable shared option builders.
- [X] Repeatable `--stack` and `--var` values reach the existing workflow in order; conflict policy and interactivity options retain their existing meanings.
- [X] Unknown and inapplicable options, missing values, invalid conflict policies, and unexpected positionals are rejected explicitly.
- [X] Commander generates init help; existing prompts, terminal detection, Config creation, Blueprint installation, non-help output, and Chalk styling remain unchanged.
- [X] The existing Commander-independent `run` interface and application-owned service lifecycle are preserved.
- [X] Source CLI subprocess tests cover help, repeated values, option validation, and representative interactive and non-interactive behavior; direct service coverage remains valid.
- [X] Existing update, SDD workspace, and setup-project behavior remains functional during the transition.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-11-06T23:20:00Z - @unknown**
Execution: claimed at base snapshot `f55ae659fae89c202dba120b300f4172720e82fe`; dependency ticket 01 is integrated in the existing checkout.

**2026-11-06T23:21:00Z - @unknown**
Execution: implementing at base snapshot `f55ae659fae89c202dba120b300f4172720e82fe`; dispatched ticket 02 in the shared checkout.

**2026-11-06T23:28:00Z - @unknown**
Execution: changes-requested on HEAD `f55ae659fae89c202dba120b300f4172720e82fe` plus uncommitted ticket 02 changes. Controller ticket-wide tests found existing root `--help` behavior regressed after removing init's legacy fallback: root help is no longer handled, breaking SDD and setup-project help tests. Assigned corrective round 1 (budget 1/5), finding `TASK-02-001`. Initial reviews have not started.

**2026-11-06T23:29:00Z - @unknown**
Execution: implementing corrective round 1 for `TASK-02-001`; initial implementation report and failing controller check are preserved. Fix report history will be appended to `../reports/02-implementation.md`.

**2026-11-06T23:40:00Z - @unknown**
Execution: in-code-review on HEAD `f55ae659fae89c202dba120b300f4172720e82fe` plus corrected uncommitted ticket 02 changes. Controller tests passed (72/72), format/lint/type-check/whitespace checks passed. Frozen for parallel initial code, code-slop, and Spec/Quality reviews.

**2026-11-06T23:55:00Z - @unknown**
Execution: changes-requested on the same frozen snapshot. Code review PASS; code-slop review noted minor duplicated lazy App factory wiring; Spec/Quality finding `TASK-02-002` blocks acceptance because invalid Stack values and malformed `--var` values are validated only after Git discovery. Assigned corrective round 2 (budget 2/5). Initial review reports are preserved.

**2026-11-07T04:30:00Z - @unknown**
Execution: in-review for corrective round 2 on HEAD `f55ae659fae89c202dba120b300f4172720e82fe` plus ticket 02 changes. Semantic argument validation now precedes Git discovery, and the shared lazy App factory addresses the Minor slop finding. Controller checks passed: 73/73 tests, format/lint/type-check/whitespace; scoped re-review dispatched for `TASK-02-002` and fix regressions. See `../reports/02-round-2-review.md`.

**2026-11-07T04:35:00Z - @unknown**
Execution: accepted on HEAD `f55ae659fae89c202dba120b300f4172720e82fe` plus corrected round-2 snapshot. Code review PASS, code-slop finding `SLOP-02-001` addressed, and Spec/Quality PASS after scoped re-review; blocker `TASK-02-002` addressed. Ticket/direct-service tests passed 73/73, format/lint/type-check/whitespace checks passed. Reports: `../reports/02-code-review.md`, `../reports/02-code-slop-review.md`, `../reports/02-task-review.md`, `../reports/02-round-2-review.md`.
