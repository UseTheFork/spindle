---
name: ref-php-laravel-framework
description: "Use when designing, implementing, or reviewing domain-organized Laravel applications, Eloquent models and queries, API Resources and Form Requests, queued jobs, or Pest tests. Read only the references that apply to the task."
metadata:
  spindle:
    version: 1.0.0
---

# Laravel Framework Reference

Use this skill as lookup material for Laravel application work. Check installed dependencies, routes, models, and tests before assuming a package or behavior.

## Domain organization

Organize application code under `app/Domain/<Domain>/`. Each domain owns its models, services, jobs, `routes.php`, and service provider.

```text
app/Domain/
  Accounts/
    AccountsServiceProvider.php
    Models/User.php
  Publishing/
    PublishingServiceProvider.php
    Contracts/PostRepository.php
    Services/EloquentPostRepository.php
    Models/Post.php
    Jobs/ProcessPostJob.php
    Http/Requests/StorePostRequest.php
    Http/Resources/PostResource.php
    routes.php
```

```php
<?php

declare(strict_types=1);

namespace App\Domain\Publishing;

use App\Domain\Publishing\Contracts\PostRepository;
use App\Domain\Publishing\Services\EloquentPostRepository;
use Illuminate\Support\ServiceProvider;

class PublishingServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(PostRepository::class, EloquentPostRepository::class);
    }

    public function boot(): void
    {
        $this->loadRoutesFrom(__DIR__.'/routes.php');
    }
}
```

Register domain providers through the application's provider registration mechanism. Define route middleware and prefixes in the domain's `routes.php`.

Use explicit services or contracts across domains; avoid catch-all domains. Map domain model factories explicitly when default factory discovery does not match their namespaces.

## Reference Guide

| When working on... | Read |
| --- | --- |
| Models, relationships, persistence, query composition, eager loading, or query performance | [Eloquent](references/eloquent.md) |
| API Resources, Form Requests, validation, authorization, or response contracts | [Resources and Form Requests](references/resources-and-requests.md) |
| Background jobs, dispatch timing, retries, failures, or workers | [Queues](references/queues.md) |
| Pest suites, factories, HTTP assertions, or framework fakes | [Testing](references/testing.md) |

Load multiple references when a task crosses those areas. Do not load unrelated
references.

## Code Templates

Adapt these examples to the application's schema, route names, and test setup.
They show starting shapes, not required class names or database columns.

### Eloquent model

```php
<?php

declare(strict_types=1);

namespace App\Domain\Projects\Models;

use App\Domain\Accounts\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    use HasFactory;

    protected $fillable = ['name'];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function members(): HasMany
    {
        return $this->hasMany(ProjectMember::class);
    }
}
```

### Pest integration tests

```php
<?php

declare(strict_types=1);

use App\Domain\Projects\Jobs\BuildProjectReport;
use App\Domain\Projects\Models\Project;
use Illuminate\Support\Facades\Queue;

describe('Projects', function (): void {
    it('returns the project resource', function (): void {
        $project = Project::factory()->create();

        $this->getJson("/api/projects/{$project->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $project->id);
    });

    it('queues a report for the project', function (): void {
        Queue::fake();
        $project = Project::factory()->create();

        $this->postJson("/api/projects/{$project->id}/reports")
            ->assertAccepted();

        Queue::assertPushed(
            BuildProjectReport::class,
            fn (BuildProjectReport $job) => $job->projectId === $project->id,
        );
    });
})->group('Projects');
```

Follow `tests/Pest.php` for suite setup and database isolation. Adjust the JSON path to the API's configured resource shape. A queue fake checks dispatch; test job execution separately when its behavior matters.

## Constraints

- Inspect the application's models, migrations, route registration, installed
  packages, and tests before assuming names, columns, guards, or dependencies.
- When the application schema or queue configuration is unavailable, state
  what must be confirmed instead of inventing relationships, keys, or timing
  values.
- Validate untrusted input and authorize each protected action. Authentication,
  route model binding, and validation do not replace authorization.
- Use Eloquent or parameter bindings for user-controlled query values. Do not
  build raw SQL by interpolating input.
- Keep controllers focused on HTTP coordination. Put access decisions in
  policies or gates, request rules in validation, and background work in jobs.
- Read secrets and environment-specific values through configuration. Do not
  hardcode credentials, URLs, storage locations, or deployment settings.
