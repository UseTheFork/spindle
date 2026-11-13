# Blueprint Management

This context owns the catalog-driven lifecycle that installs and updates
Blueprints. Shared Stack, Variable, and Project Settings terms are defined in the
[project glossary](../../GLOSSARY.md).
Templates and Computed Variables belong to
[Template Rendering](../TemplateRendering/GLOSSARY.md).

**Blueprint**:
A definition for a kind of spindle-managed content, such as a Skill,
Instruction, or Agent.

**Blueprint Catalog**:
The inventory of named Blueprint selections and the
Stacks they apply to. A selection can contain multiple independently updated
Blueprints. Declarative shipped metadata lives in `src/Assets/Blueprints/Catalog.ts`;
Blueprint Management owns its validation and selection lifecycle.

**Selected directory membership**:
The files present in a catalog-selected source directory. Managed Skill
directories are authoritative: files absent from the source, including local
additions, are removed during reconciliation.

**Blueprint reconciliation**:
The coordinated planning and application of selected Blueprint installations,
updates, Project Settings writes, and removals.
