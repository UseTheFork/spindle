# {{ variables.title | default("[TICKET TITLE]") }}

- **Reporter:** {{ variables.reporter | default("[REPORTER]") }}
- **Category:** {{ variables.category | default("[CATEGORY]") }}
- **Author:** {{ variables.author | default("[AUTHOR]") }}

## Requirements

{{ variables.requirements | default("[REQUIREMENTS]") }}

## Acceptance Criteria

{{ variables.acceptance_criteria | default("[ACCEPTANCE CRITERIA]") }}

## Comments
