# 07: Require eligible specialist reviews

Reporter: User
Category: enhancement

**What to build:** A controller can require a justified specialist review using
catalog-declared eligibility, and acceptance waits for every required agent's
distinct review assignment.

**Blocked by:** 05: Review and accept a finding-free implementation.

**Status:** ready-for-agent
**Execution:** integrated

- [X] Agent catalog definitions accept optional `canReview?: boolean` and normalized agent entries preserve it. Only a known catalog agent with explicit true is eligible; omitted/false is ineligible.
- [X] Runtime validation rejects nonboolean values and the field on skills/instructions. Existing catalog normalization, rendering, and lifecycle behavior otherwise remain unchanged.
- [X] `review require` takes explicit spec/issue selection, agent, details, and author, and records a justified specialist objective before review. Unknown/ineligible agents fail without mutation.
- [X] No generic capabilities, lifecycle-status, Stack-applicability, installation, or CLI harness-availability checks are added. Controller guidance separately requires confirming actual callability before dispatch.
- [X] Each required agent receives a distinct assignment/report destination while retaining role `review`. Assignment identity and submitted provenance cannot be substituted across reviewers.
- [X] Acceptance waits for the entire recorded required batch; failed, unavailable, missing, or stale specialist evidence blocks. No default three-reviewer batch or selectable profile is introduced.
- [X] Requirements are pinned and cannot be silently removed or replaced by upgraded defaults. Repeated requirement registration does not create duplicate reviewers/history.
- [X] Existing catalog tests cover optional-field validation/normalization; public CLI tests cover eligibility, objectives, distinct assignments, incomplete batches, provenance, idempotency, and stored-policy stability.
- [X] Related specialist guidance, eligible reviewer catalog entries, Blueprint lifecycle integration, and Just-based validation accompany the behavior.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-11-08T03:23:13Z - @Copilot**
Claimed issue 07 from clean baseline `624c7744feb0f022b7983907feda41e4fe0d0a65`; issue 05 is integrated, satisfying the declared dependency. Controller author is `Copilot`. Implementation is scoped to issue 07; no worker commit is authorized, and the controller retains review, acceptance, and integration ownership. Durable implementation handoff: `../reports/07-implementation.md`.

**2026-11-08T03:24:00Z - @Copilot**
Implementation assignment dispatched for issue 07. The public CLI is the behavioral seam for `review require`, assignment identity, submission provenance, and acceptance gating; catalog tests cover optional eligibility validation/normalization. Agent-callability is a controller dispatch prerequisite, separate from catalog eligibility. Report destination: `../reports/07-implementation.md`.

**2026-11-08T04:17:43Z - @Copilot**
Frozen for comprehensive initial Spec/Quality review at base/HEAD `624c7744feb0f022b7983907feda41e4fe0d0a65`. Exact implementation file SHA-256 values: `docs/agents/issue-tracker.md` `aeb39d13cc0627b001b2f0c941617cf5ac6e56b34276ad3566e68b7510952437`; `docs/agents/tooling.md` `5487ce33e25a17a68c2fe656f03d583ab889e375b95cbee8dedf98da10954a51`; `src/blueprints/agents/sdd-code-reviewer.agent.md` `1343670266749dfff8cad28691dde08893375f0e91bcc952268eede500986faf`; `src/blueprints/agents/sdd-orchestrator.agent.md` `86e4a6ee48702413c0089dd19531b4884d6d34fc668cb66bacc0864d1dee99ca`; `src/blueprints/catalog.ts` `8d7e86ffb68705d963ad3aeeaed1c73822682fac4339f833b738ddd811a20080`; `src/blueprints/skills/int-subagent-driven-dev/SKILL.md` `a0cf3cd014f507f8000c0f54ec7f50fe5691245e038f65dd91a247dbaf5c89cc`; `src/commands/sdd/sdd-command.ts` `d5a873abee5c967572a7efe31e63c3456ccb24f3b2b1c0b6fff0673a5962ccf3`; `tests/catalog.test.ts` `62a7b65f47cc0d37f2acbcfe4ec4231d94ea4a62914c2aa2a378ef0e12ac2a89`; `tests/sdd-workflow.test.ts` `387f8e64448fdd1e7adbf94986da9e59ca45cd192e74a55c40b5e3dc4be09b43`. Controller-owned issue tracking/report files are excluded from product code identity. Fresh controller checks: format check passed; targeted lint passed; focused catalog/SDD/install suite 69/69 passed; type-check, build, and diff check passed; packaged CLI tests 5/5 passed. Full suite was not run. Review destination: `../reports/07-review.md`.

**2026-11-08T04:22:31Z - @Copilot**
Comprehensive initial review `../reports/07-review.md` returned Spec PASS, Quality PASS, and no findings. The supplied same-snapshot verification covers issue 07; full repository tests and coverage were not run. Controller accepts issue 07 with no unresolved blocker; triage remains `ready-for-agent`.
