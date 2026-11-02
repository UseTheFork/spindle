# SDD workspace resolver

This helper documentation is now part of the active [SDD Skill](../../skills/int-subagent-driven-dev/SKILL.md), under "Resolve report destinations". The CLI entry point is:

```sh
spindle sdd workspace --workspace /absolute/checkout \
  --reports-dir .scratch/2026-10-23-feature/reports --ticket 03 [--round 2]
```

The resolver is read-only and returns checkout-relative and absolute destinations for the report kinds listed in the Skill. Invoke it directly rather than using a Just wrapper.
