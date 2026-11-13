# Testing

Use Pest only. Match routes, validation rules, guards, and response shapes to the application.

## Suites and setup

- `Unit`: isolated logic. `Integration`: application or database flows. `E2E`: opt-in browser journeys.
- Read production behavior, nearby tests, and `tests/Pest.php` before choosing setup. Respect project-defined internal or Sandbox exclusions.
- Follow suite setup for Laravel's `Tests\TestCase`, database isolation, and browser testing.
- Use one top-level `describe(...)->group(...)` per behavior test file; move existing standalone cases into it when editing that file. Keep architecture expectations in file-scope `arch()`.

## Integration tests

```php
<?php

declare(strict_types=1);

use App\Domain\Accounts\Models\User;
use App\Domain\Publishing\Models\Post;

describe('Posts', function (): void {
    it('allows a user to create a post', function (): void {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/posts', [
            'title' => 'Test Post',
            'content' => 'Post content.',
        ])->assertCreated()->assertJsonPath('data.title', 'Test Post');

        $this->assertDatabaseHas('posts', [
            'title' => 'Test Post',
            'user_id' => $user->id,
        ]);
    });

    it('rejects guests', function (): void {
        $this->postJson('/api/posts', [])->assertUnauthorized();
    });

    it('prevents updates to another user\'s post', function (): void {
        $post = Post::factory()->for(User::factory())->create();

        $this->actingAs(User::factory()->create())
            ->putJson("/api/posts/{$post->id}", [
                'title' => 'Changed title',
                'content' => $post->content,
            ])->assertForbidden();

        expect($post->fresh()->title)->toBe($post->title);
    });
})->group('Posts');
```

## Validation and datasets

```php
<?php

declare(strict_types=1);

use App\Domain\Accounts\Models\User;

describe('Post validation', function (): void {
    it('requires a title', function (mixed $title): void {
        $this->actingAs(User::factory()->create())
            ->postJson('/api/posts', [
                'title' => $title,
                'content' => 'Post content.',
            ])->assertUnprocessable()->assertJsonValidationErrors('title');
    })->with([
        'missing' => [null],
        'empty' => [''],
    ]);
})->group('PostValidation');
```

## Factories and database assertions

```php
<?php

declare(strict_types=1);

use App\Domain\Accounts\Models\User;
use App\Domain\Publishing\Models\{Comment, Post};

describe('Post deletion', function (): void {
    it('soft deletes a post', function (): void {
        $post = Post::factory()
            ->for(User::factory())
            ->has(Comment::factory()->count(3))
            ->create();

        $post->delete();

        $this->assertSoftDeleted($post);
    });
})->group('PostDeletion');
```

Use `assertSoftDeleted` only for soft-deleting models; use `assertModelMissing` for hard deletes.

## Fakes and external effects

```php
<?php

declare(strict_types=1);

use App\Domain\Accounts\Models\User;
use App\Domain\Publishing\Jobs\ProcessPostJob;
use App\Domain\Publishing\Models\Post;
use Illuminate\Support\Facades\Queue;

describe('Post processing', function (): void {
    it('queues post processing', function (): void {
        Queue::fake();
        $post = Post::factory()->for(User::factory())->create();

        $this->actingAs($post->user)
            ->postJson("/api/posts/{$post->id}/process")
            ->assertAccepted();

        Queue::assertPushed(
            ProcessPostJob::class,
            fn (ProcessPostJob $job) => $job->postId === $post->id,
        );
    });
})->group('PostProcessing');
```

Use targeted fakes before the action. A queue fake proves dispatch, not job execution. For Saloon integrations, use Saloon fakes and reset global `MockClient` state between tests.

## Best practices

- Keep fixtures small and tests independent; reuse factories and helpers.
- Assert responses and persisted effects, not implementation details.
- Cover invalid input, unauthenticated requests, and forbidden actions.
- Assert rejected requests do not write data or trigger side effects.
- Test job execution separately from dispatch; avoid arbitrary coverage targets.
- Keep tests process-local; use sequential operations or transactions when they model the contract. Request an approved shared harness for simultaneous execution; do not embed child processes or worker coordination.
- Change tests only unless production changes are requested; report defects or missing test seams.
- Use the application's documented Pest command and run the narrowest relevant selection. Serialize database runs when they share a reset schema.
- Report changed tests, behavior covered, command and result, and remaining gaps. Keep destructive database, Git, and environment operations out of the workflow unless authorized.
