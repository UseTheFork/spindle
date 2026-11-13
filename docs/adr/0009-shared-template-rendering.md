---
status: accepted
---

# Share Template Rendering across Blueprint and SDD workflows

Rendering and Computed Variables currently belong to Blueprint Management.
Extract them into a Template Rendering context backed by the existing Nunjucks
engine, rather than coupling other workflows to Blueprint Management. Callers
retain ownership of CLI input collection, configuration loading, and persistence.
This revises the Computed ownership described in
[ADR-0004](./0004-application-owned-services.md).

SDD remains independent of Project Settings, preserving
[ADR-0005](./0005-subagent-development-boundaries.md). Its spec, optional design,
and ticket creation paths render their templates using only inputs already
requested by their commands, such as a title. No generic `--var` option is added.
SDD does not inherit Blueprint-specific variable defaults.

Templates use the existing `variables` and `computed` namespaces. Editorial
placeholders become Nunjucks expressions with explicit defaults preserving the
existing author prompts when no value is supplied.

All registered Computed Variable providers run once per operation, using the
caller's supplied inputs. Results are reused within that operation. Prefer this
existing eager behavior over on-demand evaluation, whose additional complexity
is not justified by current needs. Providers do not implicitly load Project
Settings; missing required inputs fail explicitly.

Undefined values without explicit defaults, invalid template syntax, and
Computed Variable failures abort creation without publishing partial files.
Rendering is not automatic document authoring.
