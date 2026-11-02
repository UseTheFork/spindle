Category: enhancement
Status: ready-for-agent
Reporter: unknown

# 03: Preflight and stage module reconciliation

**What to build:** As a project maintainer, I want unsafe targets and
preparation errors detected before Spindle changes generated modules or the
root `justfile`, so that failed reconciliation does not leave avoidable
partial updates.

**Blocked by:**

- 01: Generate and import Just Modules during `init`.
- 02: Reconcile Just Modules during `update`.

- [ ] Preflight root import conflicts and filesystem safety conditions before
      replacing or removing any generated module files.
- [ ] Reject a root `justfile`, managed module directory, or generated module
      destination that is a symbolic link or a non-regular file where a regular
      file is required; report the error without following or replacing it.
- [ ] Render and prepare every selected module before changing managed files;
      template and missing-Variable errors leave generated modules and the root
      `justfile` unchanged.
- [ ] Stage all prepared module files and the reconciled root `justfile` before
      applying replacements or obsolete-file cleanup.
- [ ] Report filesystem errors if applying staged changes fails; do not
      attempt rollback, and allow a later run to regenerate managed outputs.
- [ ] Add end-to-end CLI tests proving preflight, render, and staging failures
      preserve managed files, safety checks refuse unsafe targets, and apply-time
      failures are explicit.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
