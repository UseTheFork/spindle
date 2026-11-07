# 09: Integrate through caller-owned commits

Reporter: User
Category: enhancement

**What to build:** A controller receives a safe accepted-file hand-back, makes a
commit externally, and asks the CLI to verify that existing commit before
integration is recorded and dependent issues become ready.

**Blocked by:** 06: Register findings and enforce explicit rulings.

**Status:** ready-for-agent

- [ ] `integrate` requires accepted work with current evidence and validates the frozen controller-confirmed Git inventory. It returns exact accepted files and delivery records requiring a caller-owned commit.
- [ ] Changed accepted content, unresolved blockers, stale evidence, or unsafe unrelated pending changes produce explicit nonzero errors without altering user work or silently broadening scope.
- [ ] `integrate --commit <sha>` verifies an existing caller-created commit's delivered content against accepted content and baseline/provenance, rejects mismatches, and only then records execution `integrated`.
- [ ] The CLI does not stage, commit, stash, discard, push, publish, or close issues. Inventory comes from Git rather than a separate ownership registry or inferred filename intent.
- [ ] Verification supports the original dirty-content review becoming committed without losing valid identical-content evidence. Generated audit/report changes remain outside code identity.
- [ ] Integration confirmation returns resulting delivery-record changes for the caller to commit before the next claim, without an endless confirmation loop. Repeated confirmation is idempotent.
- [ ] Integrated prerequisites become ready-queue eligible. A subsequent claim still rejects uncommitted delivery records and records its own clean baseline only after the caller commits them.
- [ ] Public CLI tests use real caller-created commits to verify hand-back, mismatch/unsafe-change failures, no Git mutations by commands, repeat confirmation, evidence preservation, and dependent-issue readiness.
- [ ] Related integration/help guidance explains prepare-and-confirm and record commits; Just-based validation covers the completed hand-back behavior.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
