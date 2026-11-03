set positional-arguments

[doc('Run the Spindle CLI from source with arbitrary arguments')]
run *args:
    @cd {{ justfile_directory() }} && pnpm run spindle "$@"

[doc('Install project Blueprints')]
init *args:
    @cd {{ justfile_directory() }} && pnpm run spindle init "$@"

[doc('Update installed project Blueprints')]
update *args:
    @cd {{ justfile_directory() }} && pnpm run spindle update "$@"

[doc('Run subagent-driven development workflow commands')]
sdd *args:
    @cd {{ justfile_directory() }} && pnpm run spindle sdd "$@"

[doc('Bootstrap missing project documentation defaults')]
setup-project *args:
    @cd {{ justfile_directory() }} && pnpm run spindle setup-project "$@"
