set positional-arguments

[doc('Lint files and automatically fix issues')]
lint *args:
    @cd {{ justfile_directory() }} && pnpm lint:fix "$@"

[doc('Lint files without modifying them')]
check *args:
    @cd {{ justfile_directory() }} && pnpm lint "$@"
