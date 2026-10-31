set positional-arguments

[doc('Format files')]
format *args:
    @cd {{ justfile_directory() }} && pnpm fmt "$@"

[doc('Check formatting without modifying files')]
check *args:
    @cd {{ justfile_directory() }} && pnpm fmt:check "$@"
