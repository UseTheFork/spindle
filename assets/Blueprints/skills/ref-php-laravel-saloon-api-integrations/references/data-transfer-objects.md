# Data Transfer Objects

A data transfer object (DTO) gives typed fields to API data.
Define response mapping on the request, or on the connector when all requests share that mapping.
Retrieve the DTO from the response.

## Define the DTO and mapping

```php
final class Product
{
    public function __construct(
        public readonly int $id,
        public readonly string $name,
        public readonly int $priceCents,
    ) {}
}
```

```php
use Saloon\Http\Request;
use Saloon\Http\Response;

class GetProductRequest extends Request
{
    // method, constructor, and endpoint ...

    public function createDtoFromResponse(Response $response): Product
    {
        $data = $response->json();

        return new Product(
            id: $data['id'],
            name: $data['name'],
            priceCents: $data['price_cents'],
        );
    }
}
```

## Retrieve the DTO

```php
$response = $connector->send(new GetProductRequest(42));

$product = $response->dtoOrFail(); // throws LogicException if the response failed
$product = $response->dto();       // always maps, even for failed responses
```

Use `dtoOrFail()` for success-only DTOs. It prevents mapping an error body into `Product`.
Use `dto()` only when the mapping handles error payloads.
"Failed" follows `hasRequestFailed()`; see [Handling failures](handling-failures.md).

`dto()` returns `mixed`. For static analysis, annotate it with `/** @var Product $product */`, or call the typed method directly: `$request->createDtoFromResponse($response)`.

## DTOs in requests

Accept a DTO in a request constructor to build the request body.

```php
use Saloon\Contracts\Body\HasBody;
use Saloon\Enums\Method;
use Saloon\Traits\Body\HasJsonBody;

class UpdateProductRequest extends Request implements HasBody
{
    use HasJsonBody;

    protected Method $method = Method::PUT;

    public function __construct(protected readonly Product $product) {}

    public function resolveEndpoint(): string
    {
        return '/products/' . $this->product->id;
    }

    protected function defaultBody(): array
    {
        return [
            'name' => $this->product->name,
            'price_cents' => $this->product->priceCents,
        ];
    }
}
```

## Keep the source response

Implement `WithResponse` and use `HasResponse` to attach the original response to the DTO.

```php
use Saloon\Contracts\DataObjects\WithResponse;
use Saloon\Traits\Responses\HasResponse;

final class Product implements WithResponse
{
    use HasResponse;

    // constructor ...
}

$product->getResponse()->status();
```
