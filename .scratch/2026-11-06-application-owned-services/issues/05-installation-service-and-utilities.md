# 05: Application-owned installation service and focused utilities

Reporter: unknown
Category: enhancement

**What to build:** Installation behavior uses an application-owned service and immutable paths, while stateless helpers live in focused utility files instead of a large mixed-purpose module.

**Blocked by:** 01: Application construction and boot lifecycle.

**Status:** ready-for-agent

- [ ] Move cohesive installation behavior into an application-managed service using the shared constructor and asynchronous boot lifecycle, not wrappers around retained obsolete workflow exports.
- [ ] Use immutable application workspace and Blueprint source roots instead of independently deriving paths from the current directory or repeatedly consulting source-root environment state.
- [ ] Preserve Blueprint source override and packaged asset behavior through application-owned root configuration.
- [ ] Move pure helpers into focused standalone utility files under a dedicated utilities folder; keep types and constants appropriately standalone.
- [ ] Preserve installation planning, preparation, rendering, validation, filesystem safety, and explicit error behavior.
- [ ] Keep mutable operation data out of the installation singleton so repeated uses and separate applications cannot contaminate each other's work.
- [ ] Migrate every affected production consumer and direct-import test in the same ticket, including current lifecycle consumers, and remove replaced exports without compatibility adapters.
- [ ] This migration remains functional before the command and reconciliation-class migrations land; integrate with the construction foundation without requiring those tickets.
- [ ] Existing installation and related rendering tests exercise the new APIs and preserve assertions about produced files, rejected invalid input, and absence of unintended writes.
- [ ] Add observable application-isolation and repeated-operation coverage where needed, using explicit roots rather than private service state assertions.
- [ ] Validate focused installation and affected workflow tests plus type checking through Just, and update directly related documentation.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
