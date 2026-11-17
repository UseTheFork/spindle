# Context glossary map

- [Blueprint management](src/BlueprintManagement/GLOSSARY.md): Blueprints,
  catalog selection, reconciliation, installation, Stacks, and managed content.
- [Template Rendering](src/TemplateRendering/GLOSSARY.md): Templates and Rendered
  Content, Variables, and Computed Variables shared by Blueprint and SDD workflows.
- [Project](src/Project/GLOSSARY.md): project initialization, reference
  documentation, and Application Configuration.
- [Tooling](src/Tooling/GLOSSARY.md): registered tooling commands and their
  human-readable guide.
- [Settings](src/Settings/GLOSSARY.md): Project Settings and their lifecycle.
- [Subagent-driven development](src/SubagentDrivenDevelopment/GLOSSARY.md):
  features, tickets, assignments, findings, evidence, and delivery.
- [Current SDD workflows](SDD-WORKFLOWS.md): command reference, workflow
  lifecycle, and known implementation limits.
- [Git](src/Git/GLOSSARY.md): repositories, working trees, index, and commits.

Shared template rendering ownership is documented in
[ADR-0009](docs/adr/0009-shared-template-rendering.md).

Project initialization depends on Blueprint Management and Tooling. The unified
`spindle init` command installs Blueprints before initializing project guidance
and the tooling registry.
