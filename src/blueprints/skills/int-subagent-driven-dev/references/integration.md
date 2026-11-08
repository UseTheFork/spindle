# Caller-owned integration

The CLI never stages, commits, stashes, discards, pushes, publishes, or closes
issues. The controller performs Git operations externally and asks the CLI to
verify the resulting commit.

After acceptance, prepare the hand-back:

```sh
just spindle::run sdd integrate --spec <absolute-spec-path> --issue I-0001 --author controller
```

Inspect `acceptedFiles` and `deliveryRecords`. The first list is the exact
controller-confirmed inventory covered by current accepted evidence. Only those
files belong in the delivery commit. `deliveryRecords` are workflow documents,
reports, and ledger changes; preserve them and commit them separately after
integration confirmation. The command rejects changed accepted content,
stale evidence, unresolved acceptance blockers, or unrelated pending changes.
It does not alter the worktree.

Create a caller-owned commit containing only the accepted files. Then confirm
that existing commit by its full SHA:

```sh
just spindle::run sdd integrate --spec <absolute-spec-path> --issue I-0001 --commit <commit-sha> --author controller
```

Confirmation checks the recorded baseline and frozen inventory, verifies the
commit's exact paths and blobs against accepted content, and records the issue
as `integrated`. It does not create or amend a commit. A mismatch fails without
changing user content. Repeating confirmation for the same commit is
idempotent. Integration preserves unchanged checks and review evidence when the
accepted dirty content becomes that exact committed content; generated reports
and audit records are excluded from code identity.

The confirmation response lists any resulting `deliveryRecords`. Commit those
records with a separate caller-owned commit before claiming another issue.
Until that commit is made, the dirty-checkout claim gate rejects a new claim.
After the record commit, the next claim establishes its own clean baseline.
Dependencies become ready only after the prerequisite is integrated and its
required evidence remains current.

**Complete when:** confirmation records `integrated`, its record changes are
committed by the caller, and the checkout is clean before a dependent claim.
If verification fails or unrelated work is present, preserve all changes and
return the concrete blocker to the controller.
