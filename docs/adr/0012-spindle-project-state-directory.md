---
status: accepted
---

# Keep Spindle project state under `.spindle`

Store tracked Spindle configuration in `.spindle/config.json`, while keeping
human and agent reference documentation in `docs/`. This gives Spindle-owned
project configuration one clear home without hiding reference material; it
replaces the previous `.github` settings path. Existing projects must move
their data themselves; Spindle does not detect or migrate the old path.
