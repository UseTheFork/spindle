# 10: Complete whole-spec delivery

Reporter: User
Category: enhancement

**What to build:** A controller reviews and verifies integrated work as a complete
feature, resolves cross-issue findings through the same progress-based workflow,
and finishes only when aggregate evidence and the stored retrospective policy
are satisfied.

**Blocked by:** 07: Require eligible specialist reviews; 08: Correct with progress-based continuation; 09: Integrate through caller-owned commits.

**Status:** ready-for-agent
**Execution:** changes-requested

- [ ] Delivery operations use explicit `--scope delivery` mutually exclusive with `--issue`, reusing review/submit/checks/findings/correct/resume contracts rather than a separate workflow framework.
- [ ] Aggregate review covers whole-spec and cross-issue behavior through the comprehensive reviewer plus explicitly required eligible specialists; every required assignment must supply current evidence.
- [ ] Delivery findings use their own `F-0001` sequence, canonical provenance, rulings, and history rather than being arbitrarily attached to one issue.
- [ ] Delivery corrections preserve independent attempts/progress assessments and support verified scoped evidence. Unproductive work pauses for adjudication; there is no one-fix cap or weakened acceptance.
- [ ] Delivery resume restores aggregate assignments, corrective work, verification, retrospective gates, and adjudication without resetting issue or delivery history.
- [ ] Define the Git baseline/content identity for whole-spec coverage and final corrective changes so all integrated feature work is reviewed. Caller-owned commit requirements continue to apply; final changes cannot escape review/check coverage.
- [ ] `finish` requires all issues integrated, current passing aggregate required reviews and final checks, and no unresolved delivery blockers.
- [ ] A feature created with required retrospective cannot finish without a valid report. Optional features finish without one or attach one explicitly; stored policy survives resumption/upgrades.
- [ ] Public CLI tests demonstrate complete multi-issue delivery and an independently resumed delivery-scoped correction/adjudication flow, separate ID histories, specialist batches, stale aggregate evidence, and required/optional retrospective outcomes.
- [ ] Persistence, interruption recovery, idempotent submissions/completion, safe report paths, and exact finish/next/status outputs are verified at the public boundary.
- [ ] Full-spec guidance and CLI help match the completed contract; applicable Just-based tests, types, and build checks pass.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-11-08T14:05:53Z - @Copilot**
Initial comprehensive review `../reports/10-review.md` returned Spec/Quality FAIL: blocking Important `I10-R1` (post-finish mutations and contradictory status/resume) and `I10-R2` (finish bypasses recorded ownership), plus nonblocking Minor `I10-R3` (abbreviated examples omit mandatory options). Attempt 3 is authorized to address this compatible batch with public CLI regressions. Prior attempts 1 and 2 resolved concrete check/type and packaged-output failures; current focused checks demonstrate progress. Controller lifecycle ruling: successful finish is terminal for workflow evidence/requirement/finding/correction mutations; do not add an implicit reopen or new workflow framework. Preserve idempotent same-evidence finish and read-only inspection. Finished status/next/resume must consistently distinguish valid current completion from externally stale/failed completion evidence, exposing explicit blockers instead of unconditional success. Ownership handoffs remain explicit through confirmed resume; finish requires the recorded owner, including repeat confirmation. Update or explicitly label all incomplete command examples. Review all mutation surfaces, preserve history and user/Git state, and keep no-commit permissions. Fix report appends to `../reports/10-implementation.md`; scoped review destination is `../reports/10-round-3-review.md`. Delivery interruption/concurrency coverage is a recorded limitation, not a newly demonstrated defect; do not claim it verified by issue-scope tests.

**2026-11-08T14:15:00Z - @Copilot**
Check-driven attempts 1 and 2 completed; return to comprehensive INITIAL review because initial coverage is missing. Frozen base/HEAD: `e8f4040071a0fc13e41e81ec7fb263542daa1fbd`, plus five product changes. SHA-256: `src/commands/sdd/sdd-command.ts` `78480e398f212ebfde0a1e942f1ef6333de5b8b3c8ca6105c29c548460980f22`; `src/blueprints/skills/int-subagent-driven-dev/references/full-spec.md` `5cce53199f29894b78e999b730b4de4b73ccd0f15dbff892f5ce5ab1e32ba38e`; `tests/sdd-create-status.test.ts` `71d324c8f82c61984e334b8b9989395277e8ef3aaca9e79590b22406afeda2da`; `tests/sdd-workflow.test.ts` `2640bbe6228c578fe6985b28f516074f7fb7df572eb74a7fb22bf51eb2afbc8a`; `tests/packaged-cli.test.ts` `746fee0dfc8ae45c8d0a2f98e421e87676a03fe9aeeccbca72a6b85412943f57`. Controller ticket/report files are excluded from product identity. Controller-run format, lint, types, build, and diff checks pass. Six-file regression run passed all 127 non-packaged tests; two packaged fixture failures occurred while the controller's parallel build replaced assets. After build completed, the packaged set passed 5/5 without code changes. Combined current coverage: all 132 focused tests pass; full repository suite not run. Initial review destination: `../reports/10-review.md`. Review all issue-10 criteria and complete changed implementation, including shared issue-scope regressions and exact status output, not only check-driven fixes.

**2026-11-08T13:40:00Z - @Copilot**
Check-driven attempt 1 made verified progress: format, lint, types, build, and diff checks pass; the scheduled regression batch completed with 131/132 passing. Its only failure is the packaged CLI exact-status expectation omitting the new delivery summary. Controller compared that expectation with the existing source CLI status contract; the added delivery summary is intentional under issue 10, not a reason to remove output. Attempt 2 is authorized only to update the packaged exact-output assertion to the intended delivery shape, preserving no-mutation checks, and run packaged CLI tests plus applicable format/lint/type checks. Reuse unaffected passing regression/build evidence for unchanged product files. Initial comprehensive review remains required after passing checks.

**2026-11-08T13:20:00Z - @Copilot**
Controller checks after the incomplete initial handoff: scoped automatic lint fixes removed two useless spread fallbacks; format and targeted lint pass. `just test::types` fails on missing delivery assignment fields, inferred reviewer requirements lacking details, an issue-only helper called with delivery progress, and untyped delivery finding/decision validation. Build and final regression checks have not run. Check-driven corrective attempt 1 is authorized to repair the actual delivery schema/validation and shared-helper types without casts or weakening behavior, then complete the scheduled checks. Prior attempts: none. Initial review coverage is missing, so a successful checked fix must return to comprehensive initial review rather than scoped corrective review. Worker must stop and report concrete failures if the final check pass fails, not repeat indefinite full-suite loops.

**2026-11-08T11:37:30Z - @Copilot**
Claimed issue 10 from clean baseline `e8f4040071a0fc13e41e81ec7fb263542daa1fbd`; issues 07, 08, and 09 are integrated, satisfying the declared dependencies. Controller owns acceptance and integration; the implementer may not commit. Issue 08's recorded scope ruling requires delivery-scoped corrections to reuse its issue-scope contracts while maintaining independent delivery histories. Implementation report: `../reports/10-implementation.md`; review report: `../reports/10-review.md`; corrective reviews use round-specific paths.

**2026-11-08T11:37:30Z - @Copilot**
Initial implementation assignment dispatched. The public CLI in temporary Git repositories is the confirmed behavioral seam for complete delivery, persistence/resume, Git identity, caller-created commits, and retrospective outcomes; catalog and packaged CLI tests cover specialist eligibility and shipped guidance. All issue-10 criteria apply. Implement against the canonical feature spec and design, preserving issues 07–09 behavior. Project commands must use Just recipes. Worker commit authorization: none.
