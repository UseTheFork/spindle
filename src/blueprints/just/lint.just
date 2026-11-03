set positional-arguments

[doc('Lint files and automatically fix issues')]
lint *args:
    @cd {% raw %}{{ justfile_directory() }}{% endraw %} && pnpm lint:fix "$@"

[doc('Lint files without modifying them')]
check *args:
    @cd {% raw %}{{ justfile_directory() }}{% endraw %} && pnpm lint "$@"
