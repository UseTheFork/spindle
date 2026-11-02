# 03: Verify the complete packaged workflow migration

Reporter: unknown
Category: enhancement
Status: ready-for-agent
Execution: integrated

**What to build:** Make the completed migration verifiable from the packaged
Spindle CLI outside its source checkout, with both workflow commands, bundled
setup defaults, consistent active guidance, and no obsolete helper entry points.

**Blocked by:** 01: Expose SDD workspace resolution through Spindle;
02: Expose project bootstrapping through Spindle.

## Acceptance criteria

- [ ] Add repeatable public-CLI smoke coverage using actual packaged contents outside the checkout, without access to checkout-local scripts or templates; exercise both workflow commands against disposable targets.
- [ ] Verify packaged SDD resolution with and without a round produces the exact existing JSON/report destinations without creating reports or changing checkout state.
- [ ] Verify packaged setup creates all four bundled defaults with expected contents, preserves customization on repeat runs, and works in a non-Git project without a Config or prior `init`.
- [ ] Verify command discovery, `sdd` help, `sdd workspace` help, and setup help work from the package when Just is available. Verify both commands and help fail with existing installation guidance and no side effects when Just is absent.
- [ ] Verify both command families reject missing, unknown, duplicate, inapplicable arguments and invalid nesting through consistent CLI errors rather than success-shaped output.
- [ ] Remove the old shared CJS utility after confirming no active callers remain. Confirm both old implementations, superseded tests, Just modules, and root imports are absent without leaving compatibility aliases.
- [ ] Reconcile cross-cutting active Skill, example, tracker, and tooling guidance so workflow helpers call Spindle directly while project tooling still uses Just. Confirm no active reference targets removed scripts, wrappers, or relocated templates.
- [ ] Confirm changed Skill Blueprints have appropriate version bumps and no duplicate bootstrap templates remain in shipped or locally installed setup Skills. Preserve useful helper documentation without requiring users to browse package internals.
- [ ] Preserve historical feature designs, tickets, reports, and unrelated Just modules. Treat domains as feature folders without adding bounded contexts, per-context glossaries, or a glossary map.
- [ ] Run applicable existing formatting, lint, type/build, CLI regressions, and packaged smoke checks through project Just recipes. Verify unchanged `init`/`update` behavior and record any unavailable required checks explicitly.
- [ ] Verify the final package contains the setup-owned assets and has no runtime dependence on removed helper scripts, old wrappers, or target-project Skill assets.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Further context

The user approved two independent capability slices followed by this combined
packaging/migration slice. Prefer the existing public CLI test seam and
subprocess/fixture conventions; assert observable behavior rather than internal
module structure. Do not introduce new dependencies, a CLI framework, new
report kinds, or interactive setup features.

## Comments
