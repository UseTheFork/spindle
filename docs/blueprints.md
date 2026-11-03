# Authoring Blueprints

The shipped collection is controlled by `src/blueprints/catalog.yaml`. Every
catalog entry has a logical key, a source `path`, a `status` (`active` or
`removed`), and a list of supported `stacks`. Logical keys identify entries;
they do not rename installed content. An empty Stack list applies to every
Stack, and a nonempty list applies when any listed Stack is selected.

The catalog has exactly four sections: `agents`, `just`, `instructions`, and
`skills`. Empty sections are valid. Active entries must name existing sources,
including entries that do not match the current Stack selection. Removed entries
may retain a source-less path as a future cleanup record.

Paths are relative to the corresponding kind directory under
`src/blueprints/`. A path ending in `/` selects a directory recursively; its
filenames and relative structure are preserved. A path without a trailing slash
selects one file. Do not use glob patterns or internal Stack overlays. A nested
directory named `stacks/` is ordinary content.

Agents and Instructions are named Markdown files with their own version
metadata. They can be grouped in catalog-selected directories, but each file is
updated independently and keeps its source path. Skills remain directories led
by `SKILL.md`; changes and additions require a Skill version bump.

Just Modules are standalone root-level `.just` files. Stack-specific variants
are separate catalog entries and are installed as separate modules. Their
managed import identifiers come from the filename stem, not the catalog key.

Unlisted source files are not installed. Keep all four catalog sections and
validate catalog changes through the real CLI tests.
