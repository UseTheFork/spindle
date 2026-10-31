# 03: Offer new Skills during update

**What to build:** As a project maintainer, I can adopt newly shipped Skills during `update`, choose required Variables before changes are made, and understand which Skills were added, updated, or skipped.

**Blocked by:** 02 — Consolidate init and update Skill reconciliation.

**Status:** ready-for-agent

- [ ] Interactive `update` offers uninstalled shipped Skills in a multi-select with all selected by default; selecting none is allowed, and unchecked Skills count as skipped.
- [ ] `--include-new` selects all new Skills and skips the selection prompt in both interactive and non-interactive runs; without it, non-interactive runs do not install new Skills.
- [ ] `--include-new` does not replace the conflict-policy decision required for outdated installed Skills.
- [ ] New-Skill selection and outdated-Skill conflict decisions finish before writes; cancelling a prompt leaves installed Skills unchanged.
- [ ] When at least one Skill will be installed or replaced, required Variables resolve from Config, then defaults, then interactive prompts; missing required values fail non-interactively before writes. No-op runs do not prompt or fail for missing Variables.
- [ ] Prompted Variable values apply to every Skill changed in the run and are merged into Config only after all selected Skills install successfully, preserving Stacks and other Config values.
- [ ] Installation stops at the first failure without rollback; Config-write failures are surfaced without rolling back installed Skills or saving prompted values on failed installation.
- [ ] The update summary reports newly added Skills separately from updated Skills, with one skipped total and the existing invalid-version warnings.
- [ ] CLI tests cover selection, `--include-new`, cancellation, Variable prompting and persistence, failure behavior, and summaries.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
