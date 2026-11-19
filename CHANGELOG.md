# @usethefork/spindle

## 0.6.0

### Minor Changes

- [#16](https://github.com/UseTheFork/spindle/pull/16) [`9f2402b`](https://github.com/UseTheFork/spindle/commit/9f2402b0315a9e3f4a5ee2da39f08b2e4a64bcfd) Thanks [@UseTheFork](https://github.com/UseTheFork)! - Rebuild subagent-driven development around a CLI-managed work graph. Plan a feature from an optional design through its spec, tickets, and tasks, then use `spindle sdd next` to see which actions are available and why work is blocked. The updated SDD agents handle task execution, reviews, and merges through CLI-generated assignments.

  This release replaces the legacy SDD commands and does not migrate existing SDD workspaces. Start new workspaces for the new workflow.

## 0.5.1

### Patch Changes

- [#14](https://github.com/UseTheFork/spindle/pull/14) [`5211fe5`](https://github.com/UseTheFork/spindle/commit/5211fe557fe992f76c05c99ce16d66fa0a385c7b) Thanks [@UseTheFork](https://github.com/UseTheFork)! - tickets now have tasks that are controlled via the sdd command.

## 0.5.0

### Minor Changes

- [#12](https://github.com/UseTheFork/spindle/pull/12) [`6c85368`](https://github.com/UseTheFork/spindle/commit/6c853681713fc0afe2f374c4176933fd57deba4d) Thanks [@UseTheFork](https://github.com/UseTheFork)! - Update project initialization and bundled Blueprints with refreshed project-state, tooling, and SDD guidance, including renamed skill visibility categories.

- [#12](https://github.com/UseTheFork/spindle/pull/12) [`ddc0962`](https://github.com/UseTheFork/spindle/commit/ddc09627adde1760588a952355f86aa5e841aa9d) Thanks [@UseTheFork](https://github.com/UseTheFork)! - Expand SDD workflows with delivery ownership, ticket synchronization, assignment-based submissions, final-check revalidation, and improved recovery. SDD feature workspaces now use `.spindle/features/`; existing `.scratch/` workspaces must be moved manually. SDD command options now use `--feature` and `--actor` instead of `--spec` and `--author`; review no longer accepts `--inventory` or `--agent`.

## 0.4.0

### Minor Changes

- [#10](https://github.com/UseTheFork/spindle/pull/10) [`7d9548e`](https://github.com/UseTheFork/spindle/commit/7d9548ea21f196c331babe046f9937f31ad0d22f) Thanks [@UseTheFork](https://github.com/UseTheFork)! - Simplify subagent-driven development by binding checks and reviews to committed code and requirements instead of content snapshots. Format changes before committing, require fresh checks and focused review for rework, and integrate only the approved commit.

  Remove obsolete snapshot fields, CLI arguments, and compatibility code, and update worker guidance and tests.

- [#10](https://github.com/UseTheFork/spindle/pull/10) [`9b6c8dc`](https://github.com/UseTheFork/spindle/commit/9b6c8dc9a94f93d82c8d544f9b181635a47bd391) Thanks [@UseTheFork](https://github.com/UseTheFork)! - Resolve project settings with Zod and publish a versioned JSON Schema for editor support.

### Patch Changes

- [#10](https://github.com/UseTheFork/spindle/pull/10) [`888504e`](https://github.com/UseTheFork/spindle/commit/888504ea57185864e5611da0e1467d73d8b29ac0) Thanks [@UseTheFork](https://github.com/UseTheFork)! - Reference the versioned project settings schema from unpkg.

- [#10](https://github.com/UseTheFork/spindle/pull/10) [`023b950`](https://github.com/UseTheFork/spindle/commit/023b950749607e4efcdd048db5114b7ce9df7e64) Thanks [@UseTheFork](https://github.com/UseTheFork)! - Improve SDD spec and ticket authoring with a shared internal EARS reference skill. Prefer EARS for suitable behavior requirements and acceptance criteria while preserving existing document structures.

## 0.3.0

### Minor Changes

- [#8](https://github.com/UseTheFork/spindle/pull/8) [`5fc6a9a`](https://github.com/UseTheFork/spindle/commit/5fc6a9a88b9d83c5b421e1afe3d306eb3a068176) Thanks [@UseTheFork](https://github.com/UseTheFork)! - Switch to human-readable CLI output by default, add structured `--json` results, and expand built-in tooling and project guidance.

## 0.2.0

### Minor Changes

- [#6](https://github.com/UseTheFork/spindle/pull/6) [`1a57032`](https://github.com/UseTheFork/spindle/commit/1a57032519f1058cad7b5339bd55d9ae95dec869) Thanks [@UseTheFork](https://github.com/UseTheFork)! - Replace the SDD shared-checkout workflow with isolated feature and ticket worktrees, requiring explicit workspace paths and adding integration validation.

## 0.1.0

### Minor Changes

- [#4](https://github.com/UseTheFork/spindle/pull/4) [`fbf4015`](https://github.com/UseTheFork/spindle/commit/fbf40155b4c16b0d3dd809d8223a8d53facc2068) Thanks [@UseTheFork](https://github.com/UseTheFork)! - Add authoring-flow support and Laravel/Saloon reference guidance, and update shipped skill names.

## 0.0.2

### Patch Changes

- [`f945af6`](https://github.com/UseTheFork/spindle/commit/f945af673b8fadb3a92a1b963c9bf968388d13a8) Thanks [@UseTheFork](https://github.com/UseTheFork)! - bump version so publish works

## 0.1.0

### Minor Changes

- [#1](https://github.com/UseTheFork/spindle/pull/1) [`4fdbdc8`](https://github.com/UseTheFork/spindle/commit/4fdbdc8cb51532658b04e66c11323e403d3c9d24) Thanks [@UseTheFork](https://github.com/UseTheFork)! - Initial beta release for testing etc
