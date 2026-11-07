# 04: Complete CLI integration and package verification

Reporter: unknown
Category: enhancement
Status: ready-for-agent
Execution: implementing

**What to build:** Complete the transition to a single Commander command tree
with discoverable help, standard CLI errors, parsing before Git discovery, and
equivalent behavior in the built executable.

**Blocked by:** 02: Migrate init to Commander; 03: Migrate SDD and project setup to Commander.

- [ ] The root CLI composes all class-owned commands and the SDD group in one Commander tree; the legacy parser and handwritten help are removed.
- [ ] Root help lists commands; command and nested help, `-h`, the built-in help command, and version work without Git discovery.
- [ ] Unknown commands and options, missing required values, unexpected positionals, invalid conflict policies, and disallowed duplicate options produce explicit CLI errors before Git discovery; use Commander error messages and exit codes.
- [ ] Valid workspace commands still require discovery of the invocation Git working-tree root, including when invoked from a nested directory; failure has no current-directory fallback.
- [ ] Existing valid commands, workflow behavior, non-help output and Chalk styling, explicit target paths, and JSON result contracts remain intact.
- [ ] Source CLI subprocess tests cover root and nested help, Commander error behavior, and the Git startup boundary; existing workflow and direct service tests remain valid.
- [ ] Built executable tests cover help, parsing, and representative workflow behavior outside the source checkout.
- [ ] Directly related documentation and examples reflect the new help, error, and startup behavior; relevant build and targeted tests pass.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-11-07T06:15:00Z - @unknown**
Execution: claimed at base snapshot `c1ce2ac6a18e413d9c18b67d28096e86f3ae0840`; tickets 02 and 03 are integrated.

**2026-11-07T06:16:00Z - @unknown**
Execution: implementing at base snapshot `c1ce2ac6a18e413d9c18b67d28096e86f3ae0840`; ticket 04 is the only remaining dependency-eligible ticket.
