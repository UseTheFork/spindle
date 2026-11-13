# Queues

Confirm the queue connection and worker setup; dispatch is not always asynchronous.

## Jobs and dispatch

Keep jobs focused and pass stable IDs. Tune retry values to the operation and queue configuration.

```php
<?php

declare(strict_types=1);

namespace App\Domain\Publishing\Jobs;

use App\Domain\Publishing\Services\PostProcessor;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\{InteractsWithQueue, SerializesModels};

class ProcessPostJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $timeout = 120;

    public function __construct(public int $postId) {}

    public function handle(PostProcessor $processor): void
    {
        $processor->process($this->postId);
    }
}

ProcessPostJob::dispatch($postId);
ProcessPostJob::dispatch($postId)->onQueue('processing');
ProcessPostJob::dispatch($postId)->afterCommit();
```

Use `afterCommit()` when a job reads data written by the current transaction. Make jobs safe to retry; queue delivery is not exactly once.

## Chaining and batches

```php
<?php

declare(strict_types=1);

use App\Domain\Accounts\Jobs\NotifyUserJob;
use App\Domain\Publishing\Jobs\ProcessPostJob;
use Illuminate\Bus\Batch;
use Illuminate\Support\Facades\Bus;
use Throwable;

Bus::chain([
    new ProcessPostJob($postId),
    new NotifyUserJob($userId),
])->catch(fn (Throwable $e) => report($e))->dispatch();

$batch = Bus::batch([
    new ProcessPostJob($firstPostId),
    new ProcessPostJob($secondPostId),
])->then(fn (Batch $batch) => logger()->info('Batch completed', ['id' => $batch->id]))
  ->catch(fn (Batch $batch, Throwable $e) => report($e))
  ->finally(fn (Batch $batch) => logger()->info('Batch finished', ['id' => $batch->id]))
  ->allowFailures()
  ->dispatch();

$batch->add([new ProcessPostJob($anotherPostId)]);
```

## Middleware and unique jobs

Define the named rate limiter before using `RateLimited`. Use `WithoutOverlapping` to prevent concurrent work on the same key.

```php
<?php

declare(strict_types=1);

use Illuminate\Queue\Middleware\RateLimited;
use Illuminate\Queue\Middleware\WithoutOverlapping;

public function middleware(): array
{
    return [
        new RateLimited('process-posts'),
        (new WithoutOverlapping($this->postId))->expireAfter(180),
    ];
}
```

Implement `ShouldBeUnique` with a stable `uniqueId()` to prevent duplicate dispatches. Use `ShouldBeUniqueUntilProcessing` to release the lock when processing starts.

```php
<?php

declare(strict_types=1);

namespace App\Domain\Publishing\Jobs;

use Illuminate\Contracts\Queue\{ShouldBeUnique, ShouldQueue};

class ProcessPostJob implements ShouldQueue, ShouldBeUnique
{
    public int $uniqueFor = 3600;

    public function __construct(public int $postId) {}

    public function uniqueId(): string
    {
        return (string) $this->postId;
    }
}
```

## Best practices

Use installed monitoring tools; do not assume Horizon is available. A queue fake verifies dispatch, not job execution.

- Keep payloads small and pass IDs when workers should load current state.
- Let retryable exceptions reach the worker; monitor terminal failures.
- Keep worker timeouts shorter than the queue retry or visibility interval.
