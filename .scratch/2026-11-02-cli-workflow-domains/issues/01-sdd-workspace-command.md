# 01: Expose SDD workspace resolution through Spindle

Reporter: unknown
Category: enhancement
Status: ready-for-agent

**What to build:** Allow SDD controllers to resolve durable report destinations
with `spindle sdd workspace`, using the installed CLI rather than repository-local
scripts or Just wrappers. Preserve the existing resolver's JSON contract and
read-only behavior, and make active SDD guidance use the new entry point.

**Blocked by:** None (can start immediately).

## Acceptance criteria

- [ ] Implement the resolver in a separate native TypeScript feature folder named `subagent-driven-dev`. Domain functions accept typed inputs and return typed results without parsing process arguments, printing, or exiting; Git/report helpers remain local to the feature.
- [ ] Expose `spindle sdd workspace` with required `--workspace`, `--reports-dir`, and `--ticket`, plus optional `--round`. Reject missing, unknown, duplicate, inapplicable arguments and invalid nesting explicitly with the existing CLI error prefix, nonzero status, and no success-shaped JSON.
- [ ] Provide `sdd` and `sdd workspace` help and top-level command discovery. Preserve the global Just prerequisite, including help, and require neither a project Config nor prior `init`.
- [ ] Preserve the absolute Git checkout-root and valid-HEAD requirements, report-directory containment, traversal and escaping-link rejection, ignored-directory and destination checks, non-regular report target rejection, and existing ticket/round validation.
- [ ] Preserve exact result keys, report keys, filename conventions, relative/absolute destinations, and ordering. Include `scopedReview` only when a round is supplied; do not introduce new report kinds.
- [ ] Resolution creates no directories or reports, preserves existing report contents, and leaves Git checkout state unchanged.
- [ ] Port all existing SDD helper cases into the standard TypeScript tests at the public CLI seam, retaining their assertions except deliberate entry-point, help, and error-prefix changes. Cover rounds, exact output, invalid checkout/HEAD, path/link/ignore/target rejection, invalid identifiers, argument errors, and missing Just.
- [ ] Update active SDD Skill Blueprints, examples, installed local Skill guidance, and SDD-specific tracker references to invoke Spindle directly. Bump affected Blueprint versions and retain useful helper documentation.
- [ ] Remove the superseded SDD CJS implementation/tests, its Just module, and root module import. Retain the shared CJS utility while the old setup helper still uses it; provide no compatibility wrapper.
- [ ] Keep existing `init`/`update` behavior and unrelated Just modules intact. Run applicable formatting, lint, type/build, focused CLI checks, and affected regressions through existing Just recipes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Further context

The approved specification defines the exact existing resolver contract and
the public CLI testing seam. Packaged cross-feature verification belongs to
ticket 03. Ticket 02 is independent; serialize any edits to the shared CLI and
coordinate shared documentation ownership without adding an artificial blocker.
Preserve historical delivery evidence.

## Comments
