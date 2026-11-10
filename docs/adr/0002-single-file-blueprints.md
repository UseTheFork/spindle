# Flatten Single-File Blueprint Kinds

The proposed [ADR-0003](./0003-catalog-selected-blueprints.md) replaces this
decision's wrapper-directory mapping and Stack-overlay discovery. It is awaiting
design approval; the text below records the earlier architecture.

Agents and Instructions are authored as one-file Blueprint directories and installed as single files at their kind-specific destinations. This keeps discovery, Stack overlays, and duplicate-output validation in the shared lifecycle while supporting the flat file layout expected by GitHub; flat source files would require a separate discovery path, and handler-owned installation would duplicate lifecycle behavior.

An Agent's `AGENT.md` maps to `.github/agents/<name>.agent.md`; an Instruction's `INSTRUCTION.md` maps to `.github/instructions/<name>.instructions.md`. A nonempty selected plan must contain exactly its declared entry file. An overlay-only Blueprint with no selected entry is omitted, and duplicate entries from shared content or selected overlays are errors rather than overrides. Skills retain their directory destination.

The lifecycle checks the actual single-file destination for conflicts and symbolic links, renders and validates its SemVer frontmatter before replacement, and skips installed files with unknown versions on update. This decision describes the mapping for both kinds; registration of a kind is a separate implementation step.
