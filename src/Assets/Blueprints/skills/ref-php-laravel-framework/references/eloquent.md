# Eloquent

Match examples to the application's schema and Laravel version. Follow its existing cast and scope style.

## Model pattern

```php
<?php

declare(strict_types=1);

namespace App\Domain\Publishing\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Post extends Model
{
    use SoftDeletes;

    protected $fillable = ['title', 'content', 'published_at'];

    protected $casts = [
        'published_at' => 'datetime',
        'metadata' => 'array',
    ];

    protected function excerpt(): Attribute
    {
        return Attribute::make(
            get: fn () => (string) str($this->content)->limit(100),
        );
    }
}
```

## Relationships and scopes

Add these methods to `Post`. The `user_id` foreign key belongs on posts; comments store `post_id`.

```php
<?php

declare(strict_types=1);

use App\Domain\Accounts\Models\User;
use App\Domain\Publishing\Models\Comment;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany};

public function user(): BelongsTo
{
    return $this->belongsTo(User::class);
}

public function comments(): HasMany
{
    return $this->hasMany(Comment::class);
}

public function scopePublished(Builder $query): void
{
    $query->whereNotNull('published_at')->where('published_at', '<=', now());
}
```

Use `belongsToMany` for pivot tables and polymorphic relations only when the schema requires them.

## Queries and performance

```php
<?php

declare(strict_types=1);

use App\Domain\Publishing\Models\Post;
use Illuminate\Database\Eloquent\Builder;

$posts = Post::published()
    ->with('user:id,name')
    ->withCount('comments')
    ->latest()
    ->paginate();

$posts->loadMissing('comments.user');

$posts = Post::whereHas('comments', fn (Builder $query) => $query->where('approved', true))
    ->withExists('comments')
    ->paginate();

Post::lazyById()->each(fn (Post $post) => $processor->process($post));
```

Keep primary and foreign keys when limiting selected columns. Use `chunkById` or `lazyById` when updating rows during iteration.

## Events and transactions

```php
<?php

declare(strict_types=1);

namespace App\Domain\Publishing\Observers;

use App\Domain\Publishing\Models\Post;

class PostObserver
{
    public function updated(Post $post): void
    {
        cache()->forget("post.{$post->id}");
    }
}

Post::observe(PostObserver::class);
```

Register observers in the domain's service provider. Bulk updates and deletes do not fire individual model events.

```php
<?php

declare(strict_types=1);

use App\Domain\Publishing\Jobs\PublishPostJob;
use App\Domain\Publishing\Models\Post;
use Illuminate\Support\Facades\DB;

DB::transaction(function () use ($postId) {
    $post = Post::whereKey($postId)->lockForUpdate()->firstOrFail();
    $post->update(['published_at' => now()]);
    PublishPostJob::dispatch($post->id)->afterCommit();
});
```

## Best practices

- Allowlist mass-assigned fields; pass validated input, not whole requests.
- Assign ownership from trusted state; client filters do not replace authorization.
- Eager-load accessed relations; avoid queries inside loops.
- Paginate lists and use bounded iteration for large datasets.
- Bind query values; never interpolate input into raw SQL.
- Keep external work outside transactions; queue heavy event work after commit.
- Use API resources to control exposed attributes and relationships.
- Add indexes for actual query patterns; verify performance.
