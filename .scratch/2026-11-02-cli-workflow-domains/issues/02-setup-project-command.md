# 02: Expose project bootstrapping through Spindle

Reporter: unknown
Category: enhancement
Status: ready-for-agent
Execution: integrated

**What to build:** Allow project owners to run `spindle setup-project` against
an existing absolute project directory, preserving customization and receiving
the existing bootstrap JSON result. Bundle the defaults with the native setup
feature and update active setup guidance to use the CLI.

**Blocked by:** None (can start immediately).

## Acceptance criteria

- [ ] Implement bootstrap behavior in a separate native TypeScript feature folder named `setup-project`. Domain functions accept typed inputs and return typed results without parsing process arguments, printing, or exiting.
- [ ] Expose `spindle setup-project` with required `--workspace`, command-specific help, and top-level discovery. Reject missing, unknown, duplicate, inapplicable arguments and invalid nesting with the existing CLI error prefix, nonzero status, and no success-shaped JSON.
- [ ] Preserve the global Just prerequisite, including help. Accept an existing absolute project directory without requiring Git, a project Config, or prior `init`.
- [ ] Create the same directories and four default documentation files, preserving exact `workspace`, `created`, and `preserved` result keys and ordering. Preserve existing regular files byte-for-byte and make repeated runs safe.
- [ ] Preserve explicit rejection of symlink destinations, including dangling file links, and file/directory conflicts. Preserve the existing partial-setup failure model without introducing rollback or silent recovery.
- [ ] Do not create glossary content, edit Copilot instructions, or claim the Skill's interactive configuration work has been completed.
- [ ] Move the four bootstrap templates into the setup feature as their single canonical source. Resolve them relative to the feature module, never through Blueprint discovery or target-project installed Skill content.
- [ ] Extend the existing build to package the templates beside the compiled setup feature, keeping source execution and compiled execution functional without a new dependency or framework.
- [ ] Port all existing setup helper cases into the standard TypeScript tests at the public CLI seam without weakening assertions. Cover exact defaults/results, custom-file preservation, repeated runs, symlinks, conflicts, invalid/missing workspace, argument validation, help, missing Just, and non-Git operation.
- [ ] Update the setup Skill Blueprint, its examples and local installed copy, and its tracker/tooling guidance to use Spindle and describe CLI-owned defaults. Remove duplicate templates from the Blueprint and local installed Skill; reconcile all affected links without requiring package-internal source access.
- [ ] Bump changed Blueprint versions so normal updates deliver revised instructions.
- [ ] Remove the superseded setup CJS implementation/tests, its Just module, and root module import. Leave shared utility removal for ticket 03; provide no compatibility wrapper.
- [ ] Keep existing `init`/`update` behavior and unrelated Just modules intact. Run applicable formatting, lint, type/build, focused CLI checks, and affected regressions through existing Just recipes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Further context

The approved specification defines the existing bootstrap contract and confirmed
template ownership. Packaged cross-feature verification belongs to ticket 03.
Ticket 01 is independent; serialize edits to the shared CLI and coordinate
shared documentation ownership without adding an artificial blocker. Preserve
historical delivery evidence.

## Comments
