# Resources and Form Requests

Keep HTTP classes in `Domain/<Domain>/Http/Requests/` and `Domain/<Domain>/Http/Resources/`. Match policies, relationships, and response wrapping to the application.

## Form Request

```php
<?php

declare(strict_types=1);

namespace App\Domain\Publishing\Http\Requests;

use App\Domain\Publishing\Models\Post;
use Illuminate\Foundation\Http\FormRequest;

class StorePostRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Post::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'content' => ['required', 'string'],
        ];
    }
}
```

Apply authentication middleware to protected routes. For updates, authorize the bound model instance, not just its class.

## API Resource

```php
<?php

declare(strict_types=1);

namespace App\Domain\Publishing\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PostResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'content' => $this->content,
            'published_at' => $this->published_at?->toISOString(),
            'comments' => CommentResource::collection($this->whenLoaded('comments')),
            'comments_count' => $this->whenCounted('comments'),
        ];
    }
}
```

Use explicit fields and domain-owned related resources. `whenLoaded()` omits unloaded relationships; it does not fetch them.

## Controller usage

```php
<?php

declare(strict_types=1);

namespace App\Domain\Publishing\Http\Controllers;

use App\Domain\Publishing\Http\Requests\StorePostRequest;
use App\Domain\Publishing\Http\Resources\PostResource;
use App\Domain\Publishing\Models\Post;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

class PostController
{
    public function store(StorePostRequest $request): JsonResponse
    {
        $post = $request->user()->posts()->create($request->validated());

        return (new PostResource($post))->response()->setStatusCode(201);
    }

    public function index(): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Post::class);

        $posts = Post::published()
            ->with('comments')
            ->withCount('comments')
            ->latest()
            ->paginate();

        return PostResource::collection($posts);
    }
}
```

Scope list queries to rows the caller may see; `viewAny` does not filter records. Paginated resources include pagination links and metadata.

## Best practices

- Pass `validated()` or `safe()` data, not the whole request.
- Assign ownership and privileged fields from trusted state.
- Keep authorization separate from validation; register domain policies.
- Keep Form Requests focused on HTTP input, not business workflows.
- Use conditional validation rules for partial updates.
- Eager-load only required relationships; resources must not introduce queries.
- Treat resource fields as the public contract; omit secrets and internal attributes.
