set positional-arguments

[doc('Run Node tests')]
test *args:
    @cd {{ justfile_directory() }} && if [ "$#" -eq 0 ]; then pnpm test; else pnpm exec node --import tsx --test "$@"; fi

[doc('Run Node tests with coverage')]
coverage *args:
    @cd {{ justfile_directory() }} && if [ "$#" -eq 0 ]; then pnpm exec node --import tsx --test --experimental-test-coverage tests/*.test.ts; else pnpm exec node --import tsx --test --experimental-test-coverage "$@"; fi

[doc('Type-check the project without emitting files')]
types:
    @cd {{ justfile_directory() }} && pnpm exec tsc --noEmit
