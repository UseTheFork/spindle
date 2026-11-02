set positional-arguments

pnpm *args:
    @cd {{ justfile_directory() }}/packages/orchestration && pnpm "$@"

git *args:
    @cd {{ justfile_directory() }} && git "$@"

git-detailed-diff:
    #!/usr/bin/env bash
    set -euo pipefail

    printf '## Repository\n'
    git rev-parse --show-toplevel
    git status --short --branch

    printf '\n## Staged changes\n'
    if git diff --cached --quiet; then
        printf '(none)\n'
    else
        git diff --cached --no-ext-diff --unified=3
    fi

    printf '\n## Unstaged changes\n'
    if git diff --quiet; then
        printf '(none)\n'
    else
        git diff --no-ext-diff --unified=3
    fi

    printf '\n## Untracked files\n'
    mapfile -d '' untracked_files < <(git ls-files --others --exclude-standard -z)
    if ((${#untracked_files[@]} == 0)); then
        printf '(none)\n'
    else
        for file in "${untracked_files[@]}"; do
            printf '\n### %s\n' "$file"
            diff_status=0
            git diff --no-index --no-ext-diff --unified=3 -- /dev/null "$file" || diff_status=$?
            if ((diff_status > 1)); then
                exit "$diff_status"
            fi
        done
    fi
