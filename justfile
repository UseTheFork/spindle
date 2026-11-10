[private]
[doc('Display the list of recipes')]
default:
  @just --list

[doc('Build the packaged CLI and Blueprint assets')]
build:
  @pnpm run build
