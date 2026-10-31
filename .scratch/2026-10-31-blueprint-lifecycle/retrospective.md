# Delivery Retrospective — Blueprint lifecycle and Stack overlays

## 1. Summary

- **Required skills:** `int-domain-modeling` was loaded. `int-writing-instruction` was consulted for the supported domain-documentation navigation candidate.
- **Delivery:** Both tickets were delivered and integrated. Ticket 01 had three corrective implementation rounds following an initial review blocked by an incomplete frozen diff; its round-3 review marked the assigned findings addressed. Ticket 02 had two corrective implementation rounds, followed by a full-spec final fix. The final-fix re-review marked both assigned findings addressed with no new breakage.
- **Blockers and duration:** Ticket 01's tracker spans 17:32 to 18:48, about 76 minutes; its 18:12 changes-requested state ended with acceptance at 18:42, a 30-minute correction/re-review window. Ticket 02's tracker spans 18:52 to the 20:04 round-2 verification, about 72 minutes; its 19:36 changes-requested state was followed by the 20:04 corrective review, about 28 minutes. The first frozen-diff omission is documented in Ticket 01's initial code and code-slop reviews, but its exact resolution time is not timestamped in the supplied evidence.
- **Final verdict:** Delivered and integrated. Final verification recorded 76 passing tests, passing type and lint checks, changed-file formatting, and whitespace checks. Repository-wide formatting had unrelated failures outside the changed ticket files. These are supplied verification results, not checks rerun for this retrospective.
- **Integration range:** `d63e527fc49538f7d7586e7bada8ecf871a0680f..491555e7819fe10c416b5f03eef9182b870688b9`.

Evidence: [Ticket 01](./issues/01-migrate-skills-to-blueprint-lifecycle.md), [Ticket 02](./issues/02-add-stack-specific-blueprint-overlays.md), [Ticket 01 implementation](./reports/01-implementation.md), [Ticket 01 round-3 review](./reports/01-round-3-review.md), [Ticket 02 round-2 review](./reports/02-round-2-review.md), [final aggregate review](./reports/final-review.md), [final-fix review](./reports/final-fix-review.md).

## 2. Environment findings

### ENV-1 — Frozen review package completeness

- **Category:** Automated checks
- **Severity:** Minor
- **Evidence:** Ticket 01's initial code review ([report](./reports/01-code-review.md)) could not assess the implementation because the frozen package omitted the new `src/blueprints/` contents; the code-slop review independently reported the same mismatch. The corrected-snapshot review then inspected the missing files, and Ticket 01's comments record later acceptance. This omission caused a review blocker and package replacement; the supplied evidence does not give the blocker's exact duration.
- **Proposed change:** Add a fail-closed completeness check to the review snapshot-freezing step: verify that every changed and untracked path in the frozen package is represented in its content, and refuse to dispatch the package when its status or file inventory disagrees.
- **Target:** Controller-side frozen-review-package generation/checking. The evidence identifies the incomplete artifact (`ticket-01-frozen.diff`) but does not identify the source file or tool that generated it, so no repository file target can be named reliably.

## 3. Domain findings

### Glossary drift

**None.** The delivery evidence uses the root glossary's terms Blueprint, Skill, Stack, Variable, and Config consistently. The root [GLOSSARY.md](../../GLOSSARY.md) applies; `GLOSSARY-MAP.md` was absent, and the final aggregate review records that absence while noting the root glossary and applicable ADR were reviewed.

### Undefined terms

**Proposed glossary entry — “Stack overlay”**

Evidence: Ticket 02 defines optional files for selected Stacks, combination of selected overlays, and omission of unselected overlays. Its comments and corrective review further discuss collision behavior; those implementation details are intentionally excluded from this glossary draft.

Draft for [GLOSSARY.md](../../GLOSSARY.md):

> **Stack overlay**: Optional Blueprint content included only when its corresponding Stack is selected. Multiple selected Stack overlays can contribute content alongside shared Blueprint files.

### ADR candidates

**None.** The evidence supports a Stack-overlay authoring convention, but does not establish that the choice is hard to reverse, surprising without context, and the result of a documented real trade-off—all three ADR tests are required. The existing lifecycle decision is recorded in [ADR 0001](../../docs/adr/0001-blueprint-lifecycle.md).

## 4. Instruction suggestions

### INS-1 — Correct the domain-documentation navigation pointer

- **Severity:** Minor
- **Evidence:** [.github/copilot-instructions.md](../../.github/copilot-instructions.md) describes this as a multi-context repo and directs agents to use `GLOSSARY-MAP.md`; the final aggregate review reports that map absent and the root glossary reviewed. [docs/agents/domain.md](../../docs/agents/domain.md) says a root glossary is the single-context layout and instructs agents to proceed when a map is absent. The final review supplies no evidence that the absence blocked assessment, but the Copilot pointer is inconsistent with the documented fallback and observed repository layout.
- **Operation and target:** Amend `.github/copilot-instructions.md`. Do not add a duplicate topical instruction file: `docs/agents/domain.md` already owns the detailed domain-documentation guidance.
- **Scope:** Keep this as a workspace-level navigation pointer in Copilot instructions; no `applyTo` glob is needed. It concerns which domain reference to read during exploration, not a particular source-file type.
- **Proposed actionable change:** Replace the unconditional “multi-context repo; use `GLOSSARY-MAP.md`” claim with a pointer that follows the documented rule: read the root `GLOSSARY.md`, use `GLOSSARY-MAP.md` if it exists, and consult `docs/agents/domain.md` for the full guidance.
- **Expected benefit:** Avoid directing agents to a missing map when the repository's root glossary is the applicable source.
- **Overlap/conflict checked:** `.github/copilot-instructions.md`, `docs/agents/domain.md`, `.github/instructions/testing.instructions.md`, root `GLOSSARY.md`, and ADR 0001. The proposed pointer defers detailed behavior to `docs/agents/domain.md` and does not duplicate its rules.
- **Why guidance:** This is task-time navigation and context selection, not a mechanical code rule. A filesystem lookup can establish whether a map exists, but an automated check cannot replace a clear navigation pointer.
- **Follow-up validation task:** Have an agent review a domain change with the root glossary present and no map. After approval, success would be observable if the agent cites the root glossary and relevant ADR without treating the absent map as a blocker. Discovery and adherence were not tested in this read-only retrospective.

## 5. Open questions

**None.** The proposed glossary meaning is supported by Ticket 02's stated behavior; no unresolved terminology or model decision was evidenced.

---

This retrospective records proposals only. No glossary, ADR, instruction, standards, check, or skill file was changed.
