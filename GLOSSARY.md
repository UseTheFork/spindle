# Spindle

A CLI that scaffolds and maintains a project's `.github` directory from Blueprints, tailored by the Stacks and Variables the user provides.

## Language

**Blueprint**:
A definition for a kind of spindle-managed content, such as a Skill, Instruction, or Agent. A Blueprint may include guidance tailored to one or more Stacks.
_Avoid_: Stub

**Blueprint Catalog**:
The inventory of named Blueprint selections, their lifecycle status, and the
Stacks they apply to. A selection can contain multiple independently updated
Blueprints.

**Selected directory membership**:
The files present in a catalog-selected source directory. Its installed
destination subtree is authoritative: files absent from the source, including
local additions, are removed during reconciliation.

**Skill**:
A rendered directory under `.github/skills/` in the user's repo, led by a `SKILL.md` that carries a `version`.
_Avoid_: Installed Blueprint

**Interactive Skill**:
A Skill whose primary purpose is to direct an agent through ordered actions with completion criteria and progressively disclosed supporting material. Human input is required only where explicitly requested.

**Reference Skill**:
A Skill whose primary purpose is to supply knowledge an agent consults and applies as needed, rather than prescribe an end-to-end workflow. Examples and short procedures may support that knowledge.

**Internal Skill**:
A Skill intended for explicit use by a user or another Skill rather than autonomous discovery. Internal visibility is independent of whether the Skill is Interactive or Reference; a primary Skill can disclose it when needed, even if it is the only caller.

**Agent**:
A custom assistant with a specialized role, instructions, and optional tools.

**Instruction**:
Guidance automatically included for work matching its declared scope.

**Stack**:
An opinionated language-and-framework choice the user selects during `init`, such as PHP (Laravel), Python or TypeScript.
_Avoid_: Language, framework

**Variable**:
A named value the user supplies for use in Blueprints.
_Avoid_: Setting, parameter

**Computed Variable**:
A named text value derived from Config for use in Blueprints during generation. Unlike a Variable, its value is not supplied by the user, stored in Config, or directly overridden.

**Config**:
The `.github/spindle.json` file holding the user's selected stacks and variables.
_Avoid_: Settings file, manifest

**Application Configuration**:
The settings used by the running Spindle application, distinct from a project's selected Stacks and Variables in Config.

**Project workspace**:
The Git working tree whose `.github` directory Spindle maintains. Invocation from
a nested directory still targets this working-tree root, not that directory.
This is distinct from an SDD Feature workspace within the project.

**Feature workspace**:
A repository-identified collection of a feature's specification, issues,
reports, and delivery history.

**Issue**:
A numbered Markdown work item scoped to a feature workspace, with requirements,
triage state, and delivery progress.
_Avoid_: Ticket

**Review finding**:
A specific defect, requirement gap, or improvement identified while evaluating
an issue's proposed or completed work.

**Blocking finding**:
A review finding that prevents acceptance until verified fixed, dismissed as
invalid, or addressed by an approved and reviewed requirements change.

**Review policy**:
The required reviews governing a feature's delivery, including its comprehensive
independent reviewer and any justified specialist reviews.
