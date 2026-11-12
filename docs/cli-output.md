# CLI output

Every workflow command supports human-readable output by default and
machine-readable output with the global `--json` option:

```sh
spindle sdd status --spec /absolute/path/spec.md
spindle --json sdd status --spec /absolute/path/spec.md
spindle tool list --json
```

Human output uses shared success, information, and warning styling. In JSON
mode, stdout contains one compact success envelope:

```json
{ "ok": true, "data": { "ticket": "T-0001", "path": "/workspace/tickets/T-0001.md" } }
```

`data` is the command-specific typed outcome. SDD and tooling commands retain
their structured result fields inside `data`; consumers of their previous
default JSON output must now request `--json` and read the `data` field.
`init` and `update` return `stacks`, Blueprint `outcomes`, and
`guidanceInitialized`.

Diagnostics never share stdout with the result. In JSON mode, stderr contains
one JSON object per line for notices and failures:

```json
{"level":"warning","message":"An unmanaged file was preserved."}
{"ok":false,"error":{"message":"Unable to write the configuration."}}
```

Warnings do not change the exit status. Failures exit nonzero and do not emit a
success result. A failed operation can have completed side effects; inspect its
error message before retrying. JSON output has no ANSI styling, even when
`FORCE_COLOR` is set.

JSON mode disables interactive prompts. Supply all required input explicitly.
Explicit help and version requests remain ordinary text and do not initialize
an application.

## Presentation boundary

`ConsoleOutputService` is an application-owned singleton registered by
`FoundationServiceProvider`. Each invocation configures its own output mode.
CLI adapters pass `{ level, human, data }` result requests to the service;
`human` can be a message or an array of messages. Command operations and domain
services return typed outcomes without printing them.

The output service owns styling, serialization, and stdout/stderr routing.
Adapters own message wording and result types. Use `notice(level, message)` for
non-result diagnostics and `error(error)` for failures. The executable also uses
the same output policy for parsing and bootstrap failures, before an
application is available.
