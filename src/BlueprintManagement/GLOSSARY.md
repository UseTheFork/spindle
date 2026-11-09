# Blueprint Management

This context owns the catalog-driven lifecycle that installs and updates
Blueprints. Shared Stack, Variable, and Config terms are defined in the
[project glossary](../../GLOSSARY.md).

**Blueprint**:
A definition for a kind of spindle-managed content, such as a Skill,
Instruction, or Agent.

**Blueprint Catalog**:
The inventory of named Blueprint selections, their lifecycle status, and the
Stacks they apply to. A selection can contain multiple independently updated
Blueprints. Declarative shipped metadata lives in `src/Assets/Blueprints/Catalog.ts`;
Blueprint Management owns its validation and selection lifecycle.

**Selected directory membership**:
The files present in a catalog-selected source directory. Its installed
destination subtree is authoritative: files absent from the source, including
local additions, are removed during reconciliation.

**Computed Variable**:
A named text value derived from Config for use in Blueprints during generation.
Unlike a Variable, its value is not supplied by the user, stored in Config, or
directly overridden.

**Blueprint reconciliation**:
The coordinated planning and application of selected Blueprint installations,
updates, Config writes, and removals.
