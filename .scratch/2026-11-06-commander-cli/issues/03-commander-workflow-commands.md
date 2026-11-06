# 03: Migrate SDD and project setup to Commander

Reporter: unknown
Category: enhancement
Status: ready-for-agent

**What to build:** Make `spindle sdd workspace` and `spindle setup-project`
Commander-backed commands with class-owned declarations, retaining their
existing report resolution and project setup behavior.

**Blocked by:** 01: Introduce Commander through update.

- [ ] Each executable command class registers its own name, description, options, and action; the SDD group remains a grouping route rather than a new service.
- [ ] SDD workspace requires `--workspace`, `--reports-dir`, and `--ticket`, accepts optional `--round`, and preserves existing value validation and duplicate-option rejection.
- [ ] Setup-project requires `--workspace` and preserves its existing validation and duplicate-option rejection; both commands reject unknown options and unexpected positionals.
- [ ] Commander generates group and command help, and both commands retain their existing JSON output shapes, ordering, side effects, and error handling for workflow failures.
- [ ] Explicit target workspaces remain distinct from the invocation Git root, and application-owned service lifecycle and Commander-independent `run` interfaces remain intact.
- [ ] Source CLI subprocess tests cover valid and invalid options, duplicate options, representative report and setup workflows, and help; existing direct service coverage remains valid.
- [ ] Existing init and update behavior remains functional during the transition.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
