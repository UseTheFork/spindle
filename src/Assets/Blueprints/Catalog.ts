import type { BlueprintCatalogDefinition } from "@/BlueprintManagement/Catalog/BlueprintCatalog";

export const blueprintCatalog: BlueprintCatalogDefinition = {
  agents: {
    general: { path: "general.agent.md", stacks: [] },
    "sdd-code-reviewer": {
      path: "sdd-code-reviewer.agent.md",
      stacks: [],
      canReview: true,
    },
    "sdd-code-slop-reviewer": {
      path: "sdd-code-slop-reviewer.agent.md",
      stacks: [],
    },
    "sdd-implementer": { path: "sdd-implementer.agent.md", stacks: [] },
    "sdd-orchestrator": { path: "sdd-orchestrator.agent.md", stacks: [] },
    "sdd-re-review": { path: "sdd-re-review.agent.md", stacks: [] },
    "sdd-reviewer": {
      path: "sdd-reviewer.agent.md",
      stacks: [],
      canReview: true,
    },
    "sdd-task-reviewer": {
      path: "sdd-task-reviewer.agent.md",
      stacks: [],
      canReview: true,
    },
    "shared-explore": { path: "shared-explore.agent.md", stacks: [] },
    "shared-r": { path: "shared-r.agent.md", stacks: [] },
    "shared-rw": { path: "shared-rw.agent.md", stacks: [] },
    "shared-rwx": { path: "shared-rwx.agent.md", stacks: [] },
    "shared-codebase-analyzer": {
      path: "shared-codebase-analyzer.agent.md",
      stacks: [],
    },
    "shared-codebase-locator": {
      path: "shared-codebase-locator.agent.md",
      stacks: [],
    },
    "shared-web-search-researcher": {
      path: "shared-web-search-researcher.agent.md",
      stacks: [],
    },
    "shared-codebase-pattern-finder": {
      path: "shared-codebase-pattern-finder.agent.md",
      stacks: [],
    },
  },
  instructions: {
    "commit-format": {
      path: "commit-format.instructions.md",
      stacks: [],
    },
    "code-commenting": {
      path: "code-commenting.instructions.md",
      stacks: [],
    },
    "source-architecture": {
      path: "source-architecture.instructions.md",
      stacks: [],
    },
  },
  skills: {
    "int-commit-format": { path: "int-commit-format/", stacks: [] },
    "ref-asd-ste100": { path: "ref-asd-ste100/", stacks: [] },
    "author-agent": { path: "author-agent/", stacks: [] },
    "sdd-author-design": { path: "sdd-author-design/", stacks: [] },
    "author-instruction": { path: "author-instruction/", stacks: [] },
    "author-skill": { path: "author-skill/", stacks: [] },
    grill: { path: "grill/", stacks: [] },
    "sdd-grill-design": { path: "sdd-grill-design/", stacks: [] },
    "grill-with-docs": { path: "grill-with-docs/", stacks: [] },
    implement: { path: "implement/", stacks: [] },
    "sdd-implement-spec": { path: "sdd-implement-spec/", stacks: [] },
    "improve-codebase-architecture": {
      path: "improve-codebase-architecture/",
      stacks: [],
    },
    "int-codebase-design": { path: "int-codebase-design/", stacks: [] },
    "int-code-review": { path: "int-code-review/", stacks: [] },
    "int-code-slop-review": { path: "int-code-slop-review/", stacks: [] },
    "int-ref-ears": { path: "int-ref-ears/", stacks: [] },
    "ref-domain-modeling": { path: "ref-domain-modeling/", stacks: [] },
    "int-prototype": { path: "int-prototype/", stacks: [] },
    "int-retrospective": { path: "int-retrospective/", stacks: [] },
    "int-subagent-driven-dev": { path: "int-subagent-driven-dev/", stacks: [] },
    "int-test-driven-development": {
      path: "int-test-driven-development/",
      stacks: [],
    },
    "int-testing-agent-guidance": {
      path: "int-testing-agent-guidance/",
      stacks: [],
    },
    "int-verification-before-completion": {
      path: "int-verification-before-completion/",
      stacks: [],
    },
    "int-writing-agents": { path: "int-writing-agents/", stacks: [] },
    "int-writing-for-agents": { path: "int-writing-for-agents/", stacks: [] },
    "int-writing-instruction": { path: "int-writing-instruction/", stacks: [] },
    "int-writing-skills": { path: "int-writing-skills/", stacks: [] },
    retrospective: { path: "retrospective/", stacks: [] },
    "ref-php-laravel-framework": {
      path: "ref-php-laravel-framework/",
      stacks: ["php-laravel"],
    },
    "ref-php-laravel-saloon-api-integrations": {
      path: "ref-php-laravel-saloon-api-integrations/",
      stacks: ["php-laravel"],
    },
    "sdd-to-spec": { path: "sdd-to-spec/", stacks: [] },
    "sdd-to-tickets": { path: "sdd-to-tickets/", stacks: [] },
    "spindle-constitution": { path: "spindle-constitution/", stacks: [] },
    "spindle-project-setup": { path: "spindle-project-setup/", stacks: [] },
    "spindle-tooling-update": { path: "spindle-tooling-update/", stacks: [] },
  },
};
