# Blueprint Management

This context owns the catalog-driven lifecycle that installs and updates
Blueprints. Templates and Computed Variables belong to
[Template Rendering](../TemplateRendering/GLOSSARY.md).

## Language

**Blueprint**:
A definition for a kind of spindle-managed content, such as a Skill,
Instruction, or Agent. A Blueprint may include guidance tailored to one or more
Stacks.

_Avoid_: Stub

**Public Skill**:
A Skill that can be discovered and referenced by other Skills but is not
directly invocable by users.

**Skill**:
A rendered directory under `.github/skills/` in the user's repository, led by a
`SKILL.md` that carries a version.

_Avoid_: Installed Blueprint

**Interactive Skill**:
A Skill whose primary purpose is to direct an agent through ordered actions
with completion criteria and progressively disclosed supporting material.
Human input is required only where explicitly requested.

**Reference Skill**:
A Skill whose primary purpose is to supply knowledge an agent consults and
applies as needed, rather than prescribe an end-to-end workflow. Examples and
short procedures may support that knowledge.

**Private Skill**:
A Skill intended for explicit use by a user or another Skill rather than
autonomous discovery.

**Agent**:
A custom assistant with a specialized role, instructions, and optional tools.

**Instruction**:
Guidance automatically included for work matching its declared scope.

**Stack**:
An opinionated language-and-framework choice the user selects during `init`,
such as PHP (Laravel), Python or TypeScript.

_Avoid_: Language, framework

**Blueprint Catalog**:
The inventory of named Blueprint selections, their lifecycle status, and the
Stacks they apply to. A selection can contain multiple independently updated
Blueprints.

**Selected directory membership**:
The files present in a catalog-selected source directory. Managed Skill
directories are authoritative: files absent from the source, including local
additions, are removed during reconciliation.

**Blueprint reconciliation**:
The coordinated planning and application of selected Blueprint installations,
updates, Project Settings writes, and removals.
