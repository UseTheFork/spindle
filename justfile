[private]
[doc('Display the list of recipes')]
default:
  @just --list

mod? setup-project '.github/scripts/setup-project/setup-project.just'
mod? tool '.github/scripts/just-modules/tooling.just'
mod? format '.github/scripts/just-modules/format.just'
mod? lint '.github/scripts/just-modules/lint.just'
mod? test '.github/scripts/just-modules/testing.just'
