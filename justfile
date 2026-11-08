[private]
[doc('Display the list of recipes')]
default:
  @just --list

[doc('Build the packaged CLI and Blueprint assets')]
build:
  @pnpm run build

mod format '.github/scripts/just-modules/format.just'
mod lint '.github/scripts/just-modules/lint.just'
mod spindle '.github/scripts/just-modules/spindle.just'
mod tool '.github/scripts/just-modules/tool.just'
