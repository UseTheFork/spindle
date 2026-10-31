Category: enhancement
Status: ready-for-agent
Reporter: unknown

# 02: Add Stack-specific Blueprint overlays

**What to build:** As a Blueprint author, I want to provide optional whole files for selected Stacks alongside shared Blueprint files, so that content that should only exist for some Stacks can be included without making overlays the normal way to express Stack-specific guidance.

**Blocked by:** 01: Migrate Skills to the Blueprint lifecycle.

- [ ] Files at the Blueprint root are included for every selected Stack.
- [ ] Files under Stack-specific overlay directories are included only when their Stack is selected; overlays for every selected Stack are combined.
- [ ] Files in unselected Stack overlays are omitted from generated Skills.
- [ ] Shared and overlay source files are mapped to output paths before application; any duplicate output path across shared and selected overlays or between selected overlays fails explicitly without silently overwriting content.
- [ ] CLI-level `init` and `update` tests verify included shared files, selected overlays, omitted unselected overlays, and duplicate-path errors.
- [ ] Tests run as part of the existing test suite so collision validation is available for future CI enforcement.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
