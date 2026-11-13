---
status: accepted
---

# Resolve Project Settings with a shared schema

This decision replaces ADR-0005's Project Settings snapshot contract.

Zod defines Project Settings, their defaults, and runtime validation. A valid
`settings.project` contains resolved Project Settings; absent and invalid states
remain explicit. Loading does not write the file. Unknown fields are retained and
validation errors identify the affected fields. Invalid Project Settings block
settings changes rather than being replaced with defaults. Consumers read the
boot-bound snapshot; successful writes refresh that snapshot.

Completed settings commands and project updates persist the full resolved
Project Settings and regenerate guidance. Initialization and updates write a
`$schema` URL for the current Spindle release. A JSON Schema generated from the
Zod schema is published as a versioned GitHub Release asset for editor support.
Cross-field refinements that JSON Schema cannot express remain runtime checks.
Application Configuration remains separate from Project Settings.
