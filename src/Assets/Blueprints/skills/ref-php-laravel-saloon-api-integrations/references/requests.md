# Requests

Create a request class for each endpoint operation.
Saloon appends the endpoint to the connector's base URL.
Keep request classes beside their connector.

## Minimal request

Extend `Saloon\Http\Request`, set `$method`, and implement `resolveEndpoint()`.

```php
use Saloon\Enums\Method;
use Saloon\Http\Request;

class ListProductsRequest extends Request
{
    protected Method $method = Method::GET;

    public function resolveEndpoint(): string
    {
        return '/products';
    }
}
```

With the Laravel plugin installed, `php artisan saloon:request` scaffolds one.

## Constructor arguments

Pass identifiers and inputs through the constructor.

```php
class GetProductRequest extends Request
{
    protected Method $method = Method::GET;

    public function __construct(protected readonly int $id) {}

    public function resolveEndpoint(): string
    {
        return '/products/' . $this->id;
    }
}
```

## Query parameters

Override `defaultQuery()`, or add to an instance with `$request->query()->add('page', 2)`.

```php
protected function defaultQuery(): array
{
    return [
        'sort' => 'name',
        'filter[active]' => 'true',
    ];
}
```

Saloon builds query strings with `http_build_query`.

## Headers

Override `defaultHeaders()`; these merge with the connector's headers. Instance changes use `$request->headers()->add(...)`.

```php
protected function defaultHeaders(): array
{
    return ['Accept' => 'application/json'];
}
```

## JSON body

Implement `HasBody`, use `HasJsonBody`, and override `defaultBody()`.

```php
use Saloon\Contracts\Body\HasBody;
use Saloon\Enums\Method;
use Saloon\Http\Request;
use Saloon\Traits\Body\HasJsonBody;

class CreateProductRequest extends Request implements HasBody
{
    use HasJsonBody;

    protected Method $method = Method::POST;

    public function __construct(
        protected readonly string $name,
        protected readonly int $priceCents,
    ) {}

    public function resolveEndpoint(): string
    {
        return '/products';
    }

    protected function defaultBody(): array
    {
        return [
            'name' => $this->name,
            'price_cents' => $this->priceCents,
        ];
    }
}
```

## Timeouts

For endpoint-specific timeouts, use the trait and properties shown in [Timeouts](connectors.md#timeouts) on the request.
