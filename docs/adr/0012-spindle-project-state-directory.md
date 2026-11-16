---
status: accepted
---

# Keep Spindle project state under `.spindle`

Store tracked Spindle configuration in `.spindle/config.json` and SDD feature
workspaces in `.spindle/features/`, while keeping human and agent reference
documentation in `docs/`. This gives Spindle-owned project state one clear home
without hiding reference material; it replaces the previous `.github` settings
and `.scratch` workspace paths. Existing projects must move their data
themselves; Spindle does not detect or migrate the old paths.
