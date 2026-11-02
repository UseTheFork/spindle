Category: enhancement
Status: ready-for-agent
Execution: integrated
Reporter: unknown

# 03: Preflight and stage module reconciliation

**What to build:** As a project maintainer, I want unsafe targets and
preparation errors detected before Spindle changes generated modules or the
root `justfile`, so that failed reconciliation does not leave avoidable
partial updates.

**Blocked by:**

- 01: Generate and import Just Modules during `init`.
- 02: Reconcile Just Modules during `update`.

- [X] Preflight root import conflicts and filesystem safety conditions before
      replacing or removing any generated module files.
- [X] Reject a root `justfile`, managed module directory, or generated module
      destination that is a symbolic link or a non-regular file where a regular
      file is required; report the error without following or replacing it.
- [X] Render and prepare every selected module before changing managed files;
      template and missing-Variable errors leave generated modules and the root
      `justfile` unchanged.
- [X] Stage all prepared module files and the reconciled root `justfile` before
      applying replacements or obsolete-file cleanup.
- [X] Report filesystem errors if applying staged changes fails; do not
      attempt rollback, and allow a later run to regenerate managed outputs.
- [X] Add end-to-end CLI tests proving preflight, render, and staging failures
      preserve managed files, safety checks refuse unsafe targets, and apply-time
      failures are explicit.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-11-02T21:36:00Z - @unknown**
Execution set to `claimed` at commit `3adf54bafe36a24bf38ea4fb0ef4c45f7780f432`; tickets 01 and 02 are integrated, satisfying ticket 03 dependencies. The checkout is clean.

**2026-11-02T21:36:05Z - @unknown**
Execution set to `implementing` at commit `3adf54bafe36a24bf38ea4fb0ef4c45f7780f432`; ticket 03 is dispatched for Just Module preflight, staging, safety, and apply-error handling.

**2026-11-02T21:44:00Z - @unknown**
Execution set to `in-code-review` on the uncommitted ticket 03 snapshot based on `3adf54bafe36a24bf38ea4fb0ef4c45f7780f432`. Controller formatting, lint, type checking, 66 lifecycle/instruction tests, and `git diff --check` pass. The controller applied formatting and initialized the staging-directory variable after the first gate revealed formatting and definite-assignment issues; all gates were rerun successfully on the frozen snapshot. No implementation/test edits during review.

**2026-11-02T21:54:02Z - @unknown**
Execution set to `integrated` on ticket 03's verified snapshot based on `3adf54bafe36a24bf38ea4fb0ef4c45f7780f432`. Initial code and task reviews approved with no findings, and code-slop review found no material simplification. Controller formatting, lint, type, 66 lifecycle/instruction tests, and whitespace checks pass. See [implementation](../reports/03-implementation.md), [code review](../reports/03-code-review.md), [code-slop review](../reports/03-code-slop-review.md), and [task review](../reports/03-task-review.md). Aggregate review of the full spec remains pending.
