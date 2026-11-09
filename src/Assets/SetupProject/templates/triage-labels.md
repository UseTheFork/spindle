# Triage Labels

The skills speak in terms of two category roles and five state roles. For this local Markdown tracker, category roles are stored in `Category:` and state roles in `Status:`; they are separate from delivery progress in `Execution:`.

| Role in skills    | Field in our tracker | Value             | Meaning                                  |
| ----------------- | -------------------- | ----------------- | ---------------------------------------- |
| `bug`             | `Category:`          | `bug`             | Something is broken                      |
| `enhancement`     | `Category:`          | `enhancement`     | New feature or improvement               |
| `needs-triage`    | `Status:`            | `needs-triage`    | Maintainer needs to evaluate this issue  |
| `needs-info`      | `Status:`            | `needs-info`      | Waiting on reporter for more information |
| `ready-for-agent` | `Status:`            | `ready-for-agent` | Fully specified, ready for an AFK agent  |
| `ready-for-human` | `Status:`            | `ready-for-human` | Requires human implementation            |
| `wontfix`         | `Status:`            | `wontfix`         | Will not be actioned                     |

Every triaged issue has exactly one category and one state value. Keep `Execution:` independent. Edit the values in this table if the local field vocabulary changes.
