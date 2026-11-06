# 02: Migrate init to Commander

Reporter: unknown
Category: enhancement
Status: ready-for-agent

**What to build:** Make `spindle init` a Commander-backed command whose
class owns its declaration, retaining existing Blueprint installation and
configuration behavior.

**Blocked by:** 01: Introduce Commander through update.

- [ ] `init` registers its own name, description, options, and action through its command class and explicitly selects applicable shared option builders.
- [ ] Repeatable `--stack` and `--var` values reach the existing workflow in order; conflict policy and interactivity options retain their existing meanings.
- [ ] Unknown and inapplicable options, missing values, invalid conflict policies, and unexpected positionals are rejected explicitly.
- [ ] Commander generates init help; existing prompts, terminal detection, Config creation, Blueprint installation, non-help output, and Chalk styling remain unchanged.
- [ ] The existing Commander-independent `run` interface and application-owned service lifecycle are preserved.
- [ ] Source CLI subprocess tests cover help, repeated values, option validation, and representative interactive and non-interactive behavior; direct service coverage remains valid.
- [ ] Existing update, SDD workspace, and setup-project behavior remains functional during the transition.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
