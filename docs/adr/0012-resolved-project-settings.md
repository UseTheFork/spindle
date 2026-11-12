---
status: accepted
---

# Resolve project settings with a shared schema

This decision replaces ADR 0005's project configuration snapshot contract.

Zod defines project settings, their defaults, and runtime validation. A valid
`config.project` contains resolved settings; absent and invalid states remain
explicit. Loading does not write the file. Unknown fields are retained and
validation errors identify the affected fields. Invalid configuration blocks
settings changes rather than being replaced with defaults.

Completed settings commands and project updates persist the full resolved
configuration and regenerate guidance. Initialization and updates write a
`$schema` URL for the current Spindle release. A JSON Schema generated from the
Zod schema is published as a versioned GitHub Release asset for editor support.
Cross-field refinements that JSON Schema cannot express remain runtime checks.
Application configuration remains separate from project settings.
