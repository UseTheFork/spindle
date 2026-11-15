import type { BlueprintCatalogDefinition } from "@/BlueprintManagement/Catalog/BlueprintCatalogOperations";

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
    "public-ref-commit-format": { path: "public-ref-commit-format/", stacks: [] },
    "public-ref-asd-ste100": { path: "public-ref-asd-ste100/", stacks: [] },
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
    "private-codebase-design": { path: "private-codebase-design/", stacks: [] },
    "private-code-review": { path: "private-code-review/", stacks: [] },
    "private-code-slop-review": { path: "private-code-slop-review/", stacks: [] },
    "private-ref-ears": { path: "private-ref-ears/", stacks: [] },
    "public-ref-domain-modeling": { path: "public-ref-domain-modeling/", stacks: [] },
    "private-prototype": { path: "private-prototype/", stacks: [] },
    "private-retrospective": { path: "private-retrospective/", stacks: [] },
    "private-subagent-driven-dev": { path: "private-subagent-driven-dev/", stacks: [] },
    "private-test-driven-development": {
      path: "private-test-driven-development/",
      stacks: [],
    },
    "private-testing-agent-guidance": {
      path: "private-testing-agent-guidance/",
      stacks: [],
    },
    "private-verification-before-completion": {
      path: "private-verification-before-completion/",
      stacks: [],
    },
    "private-writing-agents": { path: "private-writing-agents/", stacks: [] },
    "private-writing-for-agents": { path: "private-writing-for-agents/", stacks: [] },
    "private-writing-instruction": { path: "private-writing-instruction/", stacks: [] },
    "private-writing-skills": { path: "private-writing-skills/", stacks: [] },
    retrospective: { path: "retrospective/", stacks: [] },
    "public-ref-php-laravel-framework": {
      path: "public-ref-php-laravel-framework/",
      stacks: ["php-laravel"],
    },
    "public-ref-php-laravel-saloon-api-integrations": {
      path: "public-ref-php-laravel-saloon-api-integrations/",
      stacks: ["php-laravel"],
    },
    "sdd-to-spec": { path: "sdd-to-spec/", stacks: [] },
    "sdd-to-tickets": { path: "sdd-to-tickets/", stacks: [] },
    "spindle-constitution": { path: "spindle-constitution/", stacks: [] },
    "spindle-project-setup": { path: "spindle-project-setup/", stacks: [] },
    "spindle-tooling-update": { path: "spindle-tooling-update/", stacks: [] },
  },
};
