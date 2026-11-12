# Context glossary map

- [Blueprint management](src/BlueprintManagement/GLOSSARY.md): Blueprints,
  catalog selection, reconciliation, and installation.
- [Template Rendering](src/TemplateRendering/GLOSSARY.md): Templates and Rendered
  Content, including Computed Variables shared by Blueprint and SDD workflows.
- [Project](src/Project/GLOSSARY.md): project initialization and reference
  documentation.
- [Tooling](src/Tooling/GLOSSARY.md): registered tooling commands and their
  human-readable guide.
- [Settings](src/Settings/GLOSSARY.md): project settings and their lifecycle.
- [Shared project terms](GLOSSARY.md): Stacks, Variables, Config, and
  Application Configuration.
- [Subagent-driven development](src/SubagentDrivenDevelopment/GLOSSARY.md):
  feature workspaces, issues, assignments, findings, evidence, and delivery.
- [Git](src/Git/GLOSSARY.md): repositories, working trees, index, and commits.

Cross-context ownership and bootstrap order are documented in
[ADR-0005](docs/adr/0005-subagent-development-boundaries.md). Shared rendering
ownership is documented in [ADR-0009](docs/adr/0009-shared-template-rendering.md).
SDD worktree integration is documented in
[ADR-0011](docs/adr/0011-isolated-sdd-worktrees.md).

Project initialization depends on Blueprint Management and Tooling. The unified
`spindle init` command installs Blueprints before initializing project guidance
and the tooling registry.
