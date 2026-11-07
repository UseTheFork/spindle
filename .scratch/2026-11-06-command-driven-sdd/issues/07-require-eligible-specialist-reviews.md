# 07: Require eligible specialist reviews

Reporter: User
Category: enhancement

**What to build:** A controller can require a justified specialist review using
catalog-declared eligibility, and acceptance waits for every required agent's
distinct review assignment.

**Blocked by:** 05: Review and accept a finding-free implementation.

**Status:** ready-for-agent

- [ ] Agent catalog definitions accept optional `canReview?: boolean` and normalized agent entries preserve it. Only a known catalog agent with explicit true is eligible; omitted/false is ineligible.
- [ ] Runtime validation rejects nonboolean values and the field on skills/instructions. Existing catalog normalization, rendering, and lifecycle behavior otherwise remain unchanged.
- [ ] `review require` takes explicit spec/issue selection, agent, details, and author, and records a justified specialist objective before review. Unknown/ineligible agents fail without mutation.
- [ ] No generic capabilities, lifecycle-status, Stack-applicability, installation, or CLI harness-availability checks are added. Controller guidance separately requires confirming actual callability before dispatch.
- [ ] Each required agent receives a distinct assignment/report destination while retaining role `review`. Assignment identity and submitted provenance cannot be substituted across reviewers.
- [ ] Acceptance waits for the entire recorded required batch; failed, unavailable, missing, or stale specialist evidence blocks. No default three-reviewer batch or selectable profile is introduced.
- [ ] Requirements are pinned and cannot be silently removed or replaced by upgraded defaults. Repeated requirement registration does not create duplicate reviewers/history.
- [ ] Existing catalog tests cover optional-field validation/normalization; public CLI tests cover eligibility, objectives, distinct assignments, incomplete batches, provenance, idempotency, and stored-policy stability.
- [ ] Related specialist guidance, eligible reviewer catalog entries, Blueprint lifecycle integration, and Just-based validation accompany the behavior.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
