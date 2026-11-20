# Computed Variables

The SDD task worker, reviewer, and merge agent use `{{ computed.project_guidance }}`
in their Operating Rules. It tells them to read and follow the project's
constitution and tooling guide before starting an assignment.

Variables and Computed Variables serve different purposes. A Variable is
caller-supplied text available through `variables`, such as an SDD command's
title. A Computed Variable is a named value derived by Spindle from workflow
context; that context may include Project Settings values. Reference it with standard
Nunjucks interpolation through the separate `computed` namespace, for example:

```yaml
description: "{{ computed.private_skill_description }}"
```

Computed Variable names are explicit public keys in the typed
`computedVariableProviders` registry in
`src/TemplateRendering/Computed/ComputedVariableProviders.ts`; they are not
inferred from class names. Each provider has its own module under
`src/TemplateRendering/Computed/Providers/`. To add one, implement a
`ComputedVariableProvider` subclass and register its class under the desired
template name. Providers receive the Application and choose which application
state to use; Project Settings-dependent providers should read the current
Project Settings. Ordinary template inputs remain caller-supplied and are independent of
Computed Variables. Implement a synchronous `render(): string | undefined`
method to return the value when its required application state is available, and
add the provider class to the registry under its chosen name.

Each reconciliation run gets a fresh application-managed computed-context
service. Each registered provider is instantiated with the Application and
rendered once per operation; repeated context requests reuse the resolved values
across Blueprints and version inspection. SDD feature creation renders the default
spec and design outlines without caller-supplied variables, and ticket creation
renders with its existing command inputs. A later reconciliation resolves providers
again. Computed values are not independently persisted in Project Settings,
prompted for, or directly overridable by project Variables or CLI options. Their
source inputs may be stored in Project Settings. They are developer-shipped
providers, not project plugins. The provider contract does not expose
machine-wide settings or arbitrary environment inputs.

Errors identify the missing computed name or failing registered provider and are
reported during preparation, before Spindle applies generated files, Project
Settings changes, deletions, or membership cleanup. Do not rely on an unresolved
or failed value being rendered as empty text.
