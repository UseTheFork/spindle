# CLI workspace discovery

Spindle discovers the Git working-tree root before running workspace commands:
`init`, `update`, `settings`, `tool`, and `sdd`. They fail without running if
Git is unavailable or the current directory is not inside a Git working tree.
Spindle does not fall back to the current directory. Help and version output
remain available outside Git.

`init` and `update` always manage `.github` at the discovered root, including
when invoked from a nested directory. See [Blueprint installation and
updates](../blueprints/overview.md) for their project-file behavior.
