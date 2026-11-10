# Install Blueprints before project guidance

`spindle init` is the single project initialization command: it installs the
selected Blueprints before initializing project guidance and the Tooling
registry. This keeps an unsuccessful or cancelled Blueprint selection from
leaving a project that appears initialized without its required Blueprints; a
failure after Blueprint installation does not roll back completed Blueprint
changes.
