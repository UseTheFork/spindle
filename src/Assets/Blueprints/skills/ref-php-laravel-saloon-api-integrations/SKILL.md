---
name: ref-php-laravel-saloon-api-integrations
description: "Use when building or testing Laravel API integrations with Saloon: connectors, requests, responses, failures, mocks, pools, or DTOs."
metadata:
  spindle:
    version: 1.0.0
---

# Working with Saloon

This skill covers the latest Saloon release and its Laravel plugin.

## Integration boundaries

A connector owns the base URL, shared authentication, default headers, and client configuration.
A request owns its method, endpoint, and request-specific query, headers, and body.
The connector sends the request.

## Topic lookup

Before writing code, read each reference whose condition matches the task.
For combined tasks, read all matching references.

| When working on                                                                     | Read                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Base URL, shared authentication, default headers, timeouts, or client configuration | [Connectors](references/connectors.md)                       |
| HTTP method, endpoint, inputs, query parameters, headers, or JSON body              | [Requests](references/requests.md)                           |
| `send()` or `sendAsync()`, including promise handling                               | [Sending requests](references/sending-requests.md)           |
| Status, headers, body parsing, response helpers, or custom response classes         | [Responses](references/responses.md)                         |
| HTTP or connection failures, throwing, or custom failure detection and exceptions   | [Handling failures](references/handling-failures.md)         |
| Tests, request assertions, mocks, or recorded fixtures                              | [Testing](references/testing.md)                             |
| Concurrent batches, rate limits, keyed results, or pool handlers                    | [Concurrency and pools](references/concurrency-and-pools.md) |
| Typed response mapping or DTO-driven request bodies                                 | [Data transfer objects](references/data-transfer-objects.md) |

## Sources

Use the [official documentation](https://docs.saloon.dev/) for API details beyond these references.
Use the [latest release](https://github.com/saloonphp/saloon/releases/latest) for current changes.
