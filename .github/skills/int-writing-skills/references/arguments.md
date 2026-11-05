# Arguments

Load when authoring an Interactive skill that accepts arguments, whether supplied by a user or explicitly by another skill. Argument support is optional; within an argument-accepting skill, individual inputs may be required or optional.

## Define the contract

Put `argument-hint` in frontmatter to advertise syntax. Define behavior in the skill body before workflow actions; the hint alone does not parse or validate inputs.

Specify:

- Accepted flags and positional inputs, each marked required or optional.
- Both a long name and a unique, case-sensitive single-letter short alias for every flag, with identical behavior: for example, `--test` / `-T`.
- Whether each flag is a switch or takes a value, its accepted values, and its default when omitted.
- How each input changes workflow branches or output. For example, a test option adds expanded checks while ordinary checks still run.
- Parsing rules, validation failures, and repeated or conflicting option behavior.

A calling skill supplies inputs explicitly. Use declared defaults for omissions; conversational mentions elsewhere are not arguments.

## Parsing defaults

Use these defaults for skills accepting free-form task text. If a capability needs different rules, state the replacement explicitly in its contract.

1. Parse only the leading option prefix. Recognize exact declared long and short forms; short aliases are individual tokens, not bundles such as `-TF`. Case variants are different names.
2. A value-taking flag consumes the next token as its value. Validate that token before continuing; a missing value or another option in its place requires correction. Support forms such as `--format=json` only if explicitly declared.
3. `--` ends option parsing and is not part of task text. Otherwise, the first non-option token starts the task. Preserve the remaining task text unchanged, including later flag-like text; remove only the separating whitespace before the task.
4. Reject unknown leading flags, unsupported values, and repeated options, including repetition through aliases. Never silently choose between conflicting values.
5. Validate required inputs after parsing. Explain each invalid or missing input and request correction before performing workflow actions.

For structured caller inputs, validate the same names, values, requirements, and defaults without reconstructing a command string. Any supplied raw argument string follows the same parsing contract as user input.

## Example

A skill accepting required task text and optional testing and output controls could advertise:

```yaml
argument-hint: "[--test|-T] [--format|-F <text|json>] [--] <task>"
```

Its body declares `--test` / `-T` as a switch defaulting off and `--format` / `-F` as a value-taking option defaulting to `text`, with `text` and `json` accepted. Testing enables expanded checks in addition to ordinary checks; format selects the report shape.

| Input                                         | Parsed result                                                 |
| --------------------------------------------- | ------------------------------------------------------------- |
| `-T --format json investigate --test in logs` | Testing on, JSON output; task is `investigate --test in logs` |
| `-- --test is task text`                      | Defaults; task is `--test is task text`                       |
| `--format`                                    | Request a value and required task text before work            |
| `--format text -F json investigate`           | Request one format choice before work                         |

Render the selected contract into the authored skill; its executing agent should not need this authoring reference.

**Complete when:** accepted inputs have unambiguous semantics, invalid input stops before work, and tests exercise aliases, defaults, parsing boundaries, and correction paths.
