## Finding Verdicts

**[01-CR-004] NOT ADDRESSED — Conditional frontmatter.** The original branch-only and fallback anchors now have CLI coverage (`tests/agents.test.ts:1603-1675`), and the controller reports the final 173-test suite GREEN. However, `src/version.ts:208-221` recognizes a wholly generated anchor name but skips an anchor with a static prefix and generated suffix. For example:

```yaml
---
fallback: &v2 1.0.0
{% if "python" in stacks %}
selected: &v{{ 2 }} 2.0.0
{% endif %}
version: *v2
---
```

For Python, the rendered version is `2.0.0`, but the projection at `src/version.ts:249-261,267-293` removes the selected anchor and reads the fallback. Against installed `1.0.0`, a reviewer-run in-memory `update()` check reported `up to date` for both kinds. The existing dynamic-name test uses `&{{ 'v' }}`, not this partial-name dependency. The conditional-anchor defect therefore remains open.

**[T01-I01] NOT ADDRESSED — Valid conditional frontmatter on both kinds.** Skills and Agents call the same planner (`src/blueprints/skills/handler.ts:13-14`, `src/blueprints/agents/handler.ts:15-16`, `src/blueprints/versioned.ts:36-42`); the preceding counterexample was confirmed for each. The current CLI cases cover direct conditional fields and several anchor forms for both kinds (`tests/agents.test.ts:1489-1556,1603-1675`), and the controller reports them included in the 173-test GREEN suite, but they do not cover the partial-name case.

**[R2-01] NOT ADDRESSED — Projection can silently suppress a newer update.** The exact previously reported static-name example is covered by `tests/agents.test.ts:1603-1675`, but the partial-name example above still returns `up to date` instead of updating rendered `2.0.0` over installed `1.0.0`. In addition, genuinely static versions in merged metadata are not always lazy (R3-02). The controller-reported final suite is GREEN, but its CLI cases do not cover either dependency.

**[R2-02] ADDRESSED — Production Stack coverage can silently become stale.** `tests/stubs.test.ts:8,14-19,78-88` now generates every nonempty selection from `supportedStacks`; the independent literal Agent assertions remain at `tests/stubs.test.ts:121-147`. The controller reports the final 173-test suite GREEN, including the seven current production Stack combinations.

## New Breakage in the Fix Diff

**[R3-01] Important — Transitive merge aliases can falsely replace equal-version content.** `src/version.ts:142-146,208-244` examines `*defaults` without following a nested alias, while the new merge projection at `src/version.ts:258-261` can discard the conditional declaration on which that nested alias depends. For example:

```yaml
---
fallback: &v 2.0.0
{% if "python" in stacks %}
selected: &v 1.0.0
{% endif %}
defaults: &defaults
  version: *v
<<: *defaults
---
```

For Python, both the rendered and installed versions are `1.0.0`, but the planner reports an update from `1.0.0` to `2.0.0`. In a reviewer-run, process-local virtual-filesystem check, the real `update()` handler with overwrite selected reported `updated 1` for both kinds, replaced the customized equal-version files, and removed a local Skill supporting file. Reversing the two version literals instead silently reports an actually outdated Blueprint up to date. Before this diff, merge-only frontmatter was not eligible for the static projection and this templated example was rendered. The current CLI merge test covers only a directly conditional merged anchor (`tests/agents.test.ts:1780-1810`). Add CLI coverage for transitive dependencies in both directions and both kinds, asserting preservation of equal-version content.

**[R3-02] Important — Unrelated merged metadata defeats static-version laziness.** `src/version.ts:234-244` treats any template in a merged anchor's entire mapping as a version dependency; `src/blueprints/versioned.ts:36-42` then resolves Variables and renders the whole file. For an installed `1.0.0` Blueprint, this valid raw frontmatter has a genuinely static `1.0.0` version:

```yaml
---
defaults: &defaults
  version: 1.0.0
  description: "{{ variables.not_supplied }}"
<<: *defaults
---
```

The reviewer-run planner check threw `attempted to output null or undefined value` for each kind rather than returning a no-op; the in-memory `update()` handler likewise aborted. The CLI's error path is `src/index.ts:213-216`. Before the diff, the successfully parsed version itself contained no template and stayed lazy. The current lazy-merge test puts the unrelated template outside the anchored mapping (`tests/agents.test.ts:1812-1833`). Add CLI coverage for unrelated templated properties inside a merged mapping, checking both kinds, the no-op summary, and unchanged installed content and Config.

## Updated Spec and Quality

- **Spec: FAIL.** Conditional rendered versions can be misclassified, and equal-version content can be replaced; static lazy updates can also fail.
- **Quality: FAIL.** Three assigned findings remain open and R3-01/R3-02 are Important regressions.
- **Code-review readiness: With fixes.**
- Initial task, code, and code-slop reviews are complete; no initial task review is pending. The unaffected prior evidence for mapping, overlays, destination safety, preflight-failure preservation, kind-aware output, and unversioned-Agent warnings remains recorded in `01-round-2-review.md` and `01-task-review.md`. The parked 01-SL-001/002/004 findings were not re-adjudicated.
- **Expanded review:** No broader acceptance-criterion or intended contract change identified; no new expanded-review request. The controller ruled the prior arbitrary later-I/O cross-kind rollback observation nonblocking and outside this round.

## Out-of-Scope Observations

No new observations. The prior later-I/O rollback observation remains in the review ledger under the controller's ruling.

## Verdict

**Findings remain open:** 01-CR-004, T01-I01, and R2-01 are **NOT ADDRESSED**. R2-02 is **ADDRESSED**. R3-01 and R3-02 are new Important breakage.

## Checks and Snapshot

- **Supplied fix base:** HEAD `79d44ff5497ae5f96bca06b5495be4a60dc75f69`, code tree `67d78c0cca7fc8493c6c25de8db79ac376b576b1`, fingerprint `396fd04f453a7bc7ae3343431813d48bf1d7941176bf9cf38623b8c8caef5761`.
- **Supplied fixed snapshot:** the same HEAD, code tree `93e5d18fcf6ee5c3c5651bcce19b1bab0c8b003c`, fingerprint `2a9266ef1ce23119487be119dd820c50cf332ce0e58cb5c5ca4ca995fdbf9dae`. The equal supplied HEADs indicate no intervening commit; the changes are in the supplied worktree snapshot.
- Read the complete supplied fix patch. Its independently calculated SHA-256 is `fdd69b5f96ee2382af7dac8117e3b91f962027510b35bb2dad31c5bb11d1da86`, with 3 files, 613 insertions, and 10 deletions. The reviewer-calculated ordered 24-path code fingerprint matches the fixed fingerprint, and each patch target blob matches its current file. Tree IDs and completeness of other dirty/untracked state are as supplied; no Git diff or revision commands were rerun.
- **Controller-reported, not reviewer-rerun:** after formatting and targeted lint fixes on the fixed snapshot, `just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/*.test.ts` exited 0 with **173 passed, 0 failed**. `just test::types`, `just lint::check`, changed-file `just format::check`, and `just tool::git diff --check` were reported exit 0.
- **Implementer-reported, before controller formatting:** `just test::test --test-name-pattern 'YAML anchor|templated anchors|shadowed conditional anchors|YAML merge aliases|comment-controlled version fields|YAML flow|flow versions override' tests/agents.test.ts` exited 0 with **36 passed**. `just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/agents.test.ts tests/update.test.ts tests/install.test.ts tests/reconciliation.test.ts tests/stubs.test.ts` exited 0 with **126 passed**, and the corresponding `tests/stubs.test.ts` command exited 0 with **8 passed**. The report records focused RED/GREEN evidence at `01-implementation.md:280-309` and fingerprint `dc262ee99e3d3a2a6e8a7a2d7e9a432b8782550148d366257503914ad792523b`; the controller's later suite is the reported evidence for the fixed fingerprint.
- **Reviewer-run:** six focused `just test::test --import 'data:text/javascript,...' /dev/null` checks exited 0. Two verified the fingerprint, patch checksum/stat, and target blobs. Four used process-local filesystem doubles with the real renderer, planner, or `update()` handler to confirm the partial anchor, transitive merge, lazy-merge error, and false replacement described above. Assertions confirmed the defects; these are diagnostics, not passing CLI regression tests. Virtual writes in the replacement diagnostic stayed in memory.
- **Limitations:** no project suite or real CLI subprocess was rerun by this reviewer. The baseline local-Skill inventory assertion was excluded, and global formatting had reported baseline failures. VS Code Agent loading remains scheduled for ticket 03 and is not claimed verified here.
