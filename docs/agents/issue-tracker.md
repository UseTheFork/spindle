# Issue Tracker: Local Markdown

Use this guide for repository requests handled through `/triage`. This request
tracker is separate from numbered SDD feature work; see
[ticket tracker](./ticket-tracker.md) for SDD tickets.

## Conventions

- Store triage requests in `.scratch/YYYY-MM-DD-<feature-slug>/`. Keep the
  creation date and directory stable when resuming work.
- Record the reporter in `Reporter:`, one category in `Category:` (`bug` or
  `enhancement`), and one configured triage state in `Status:`.
- Keep `Execution:` separate from triage status. It records delivery progress,
  not a category or triage role.
- Add comments with an author and UTC timestamp. Preserve prior comments and
  tracker history.
- Follow [triage labels](./triage-labels.md) for the five state mappings.

The `/triage` skill may also handle external GitHub issues and pull requests
when the user explicitly identifies them. That does not change the local
Markdown convention for repository requests.
