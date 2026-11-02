set positional-arguments

[doc('Format files')]
format *args:
    @cd {% raw %}{{ justfile_directory() }}{% endraw %} && pnpm fmt "$@"

[doc('Check formatting without modifying files')]
check *args:
    @cd {% raw %}{{ justfile_directory() }}{% endraw %} && pnpm fmt:check "$@"
