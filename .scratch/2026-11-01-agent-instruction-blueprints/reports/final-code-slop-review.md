# Final Aggregate Code-Slop Review

## Findings

### Important

None.

### Minor

1. **FSL-01 — Safety checks accept names and a mapper although callers already resolve paths.** `src/install.ts:61-71`; `src/blueprints/lifecycle.ts:273-279,343-347`.
   - **Evidence:** Every call supplies the destination directory. Every call with nonempty names also supplies the target mapper; the only use of its default passes no names (`lifecycle.ts:321`). Application computes `target`, then passes the name and mapper to compute it again.
   - **Impact:** The safety API retains an unused Skill-specific default and unnecessary indirection between the target checked and the target written.
   - **Behavior-preserving simplification:** Require the destination explicitly and accept concrete target paths rather than names plus a callback. Pass the already resolved target during application. Preserve checks of `.github`, destination, Config, and every selected target at all existing preflight, post-prompt, and per-install checkpoints. This reconfirms parked 01-SL-001; it does not recommend removing safety rechecks.

2. **FSL-02 — Blueprint names and their source files travel as parallel state.** `src/blueprints/lifecycle.ts:63-69,140-167,316-349,430-433`.
   - **Evidence:** Collection builds a file map, derives a separate names array from its keys, and carries both into planning. Planned entries retain only the name; planning, preparation, and application retrieve files through non-null asserted map lookups (`:167`, `:294`, `:433`).
   - **Impact:** Several phases depend on an implicit name/file-map invariant instead of carrying the association directly.
   - **Behavior-preserving simplification:** Collect ordered `{ name, files }` records and attach those files to each planned Blueprint. Preserve discovery and rendering order, empty Skill plans, omission of empty single-file plans, lazy context resolution, captured rendered entries, and all cross-kind preflight phases. No transaction or lifecycle redesign is needed. This reconfirms parked 01-SL-002 as optional cleanup.

3. **FSL-03 — Agent tests repeatedly manage identical fixture lifetimes.** `tests/agents.test.ts:22-65,69-137,140-177`.
   - **Evidence:** The 2,809-line new file has 35 Blueprint-root allocation sites and 35 corresponding cleanup sites, plus 37 project allocation/cleanup sites. The cited cases repeat separate directory allocation and `try/finally` removal around their actual scenario. `tests/update.test.ts:50-82` already demonstrates local scoped fixture management.
   - **Impact:** Repeated lifecycle scaffolding obscures scenario differences and makes cleanup changes repetitive.
   - **Behavior-preserving simplification:** Introduce a small test-local callback helper that owns only the two temporary directories and their cleanup. Keep source text, CLI arguments, assertions, loop isolation, and race hooks explicit; do not introduce a fixture DSL or extend the already specialized version helper. This reconfirms parked 01-SL-004, not a request for more tests.

4. **FSL-04 — The original single-Agent production test is now subsumed.** `tests/agents.test.ts:388-425`; `tests/stubs.test.ts:91-187`.
   - **Evidence:** The standalone test initializes production content for Python and checks `shared-r` metadata, tools, body, tracked-copy equality, and an Agent count. The expanded production suite includes Python among all seven supported nonempty Stack selections and performs all those checks, with stronger complete-inventory and relative-link assertions.
   - **Impact:** An extra full production CLI initialization and a duplicate assertion block must be maintained without covering a distinct contract.
   - **Behavior-preserving simplification:** Remove the standalone `shared-r` test and retain the existing production-suite assertions. No replacement test or additional matrix is necessary.

## Checks and Snapshot

- **Phase:** FINAL_AGGREGATE.
- **Workspace:** `/home/sincore/source/spindle`.
- **Base:** `79d44ff5497ae5f96bca06b5495be4a60dc75f69`.
- **Head:** `7c4af9c5ece4e939dcc366fd946cf6afe233b4a3`.
- **Snapshot:** HEAD matched the assignment; staged, unstaged, and untracked changes were absent both initially and immediately before writing this report. Included dirty/untracked implementation changes: **NONE**. This report is the only reviewer edit.
- **Covered change:** the 61-path base-to-head aggregate: Agent/Instruction handlers, shared lifecycle/install/version logic, registry, kind-aware CLI, eleven shipped Agents and local copies, authoring/glossary/ADR updates, tests and test hooks, and tracker/report history as requirements and verification evidence.
- **Evidence inspected:** canonical spec and design; all three tickets and controller comments; round-6 and ticket-02/03 implementation/check evidence; historical code-slop findings; repository instructions and Just recipes; changed production TypeScript; migration/documentation diffs; changed existing regression assertions; Instruction tests and failure hooks; selected Agent install/version/overlay/prompt/preflight/race scenarios and the version fixture; production assertions. The remaining Agent version permutations were not individually audited as a second correctness review.
- **Fresh checks run on the assigned snapshot:**
  - `just test::types` — exit 0; non-emitting type check.
  - `just lint::check` — exit 0.
  - `just tool::git --no-pager diff --check BASE HEAD -- src tests .github GLOSSARY.md docs` using the exact SHAs above — exit 0.
  - Aggregate `just tool::git --no-pager diff --check BASE HEAD` — exit 2: trailing whitespace in historical `reports/01-implementation.md` Markdown lines. This is separate from the clean implementation/doc scope, not a code-slop finding or snapshot mismatch.
  - Read-only `just tool::git --no-pager diff --no-index` comparisons of all eleven source/local Agent pairs — all exit 0, byte-identical. No Nunjucks opening syntax was found in their sources.
  - Read-only call-site inspection confirmed the safety-API usage and fixture counts above; removed version-probe identifiers were absent from `src` and `tests`.
  - Fresh HEAD/status inspection immediately before report creation reconfirmed the assigned clean snapshot.
- **Controller evidence, not independently rerun:** 246/246 regression tests excluding the known baseline local-Skill inventory assertion; type/lint and changed-file formatting checks; 8/8 production tests after final formatting; explicit human VS Code loading confirmation in ticket 03.
- **Limits:** No CLI tests were run here because `tests/helpers.ts:8-11` creates temporary directories inside the shared checkout. No formatter, dependency install, build, editor check, or implementation change was performed. Proposed simplifications were verified by data-flow/call-site and assertion comparison, not implemented or runtime-tested. If adopted, use the existing relevant regression checks; no new exhaustive matrix is requested.

## Assessment

**Code slop found? Yes.** Four minor, concrete simplifications remain: safety-API indirection, parallel planning state, repeated fixture cleanup, and a now-redundant production test. None is an important maintainability finding; the three previously parked items remain nonblocking, and acceptance belongs to the controller.

Shared rendered-version validation addresses prior 01-SL-003. The former YAML/Nunjucks probe is gone; frontmatter handling follows strategy A. Required rendering/capture consistency, staged individual replacement, safety rechecks, and source/local Agent duplication are not slop. No whole-operation rollback or templated-frontmatter laziness is requested.

### Checklist

| Checklist item(s) | Result |
| --- | --- |
| Narration, empty docblocks, placeholders, closing-brace labels | CLEAN: no material introduced pattern found. |
| Generic placeholders, run-on names, suffix abuse, type-in-name | CLEAN: no material naming simplification supported. |
| Premature interfaces, single-method classes, pure delegate wrappers, dependency creep | CLEAN: handlers have three concrete kinds; no dependency change. SUSPICIOUS: FSL-01/02 data-flow indirection. |
| Generic catches, impossible null checks, missing real defenses | CLEAN: inspected catches and repeated checks have concrete read/parse/race responsibilities; no defensive removal proposed. |
| Mock-everything, exception-only tests, mirrored implementation, snapshot substitutes | CLEAN in inspected cases: assertions exercise real CLI output/files and failure preservation. SUSPICIOUS: FSL-03/04 duplicated test scaffolding/coverage. |
| Type escapes, debug artifacts, trivial boilerplate | CLEAN: no material introduced pattern supported. Formatting consistency and absence of HACK comments are not defects. |

### Code Slop Ledger

| File(s) | Verdict | Top findings | Suggested action |
| --- | --- | --- | --- |
| `src/install.ts` | SUSPICIOUS | FSL-01 | Pass explicit target paths. |
| `src/blueprints/lifecycle.ts` | SUSPICIOUS | FSL-01/02 | Carry concrete paths and attached files without changing phases. |
| `tests/agents.test.ts` | SUSPICIOUS | FSL-03/04 | Share fixture lifetime only; remove subsumed production case. |
| Other inspected changed implementation, migration, docs, and tests | CLEAN | No further material simplification supported | No action proposed. |

No INFLATED or CRITICAL file verdict is supported. Ledger labels are maintainability signals, not acceptance decisions or quantitative line-percentage measurements.
