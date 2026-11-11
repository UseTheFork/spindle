# Responses

Synchronous `send()` returns a `Saloon\Http\Response`.
For HTTP and connection failure behavior, read [Handling failures](handling-failures.md).

## Reading a response

```php
$response = $connector->send(new GetProductRequest(42));

$response->status();             // 200
$response->header('Content-Type');
$response->body();               // raw string
$response->json();               // decoded array
$response->json('data.name');    // nested key (dot notation)
$response->json('missing', 'x'); // default when absent
$response->object();             // stdClass
$response->collect('data');      // Laravel Collection (requires illuminate/collections)
```

## Useful methods

| Method                                                                             | Purpose                                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `status()`, `headers()`, `header($name)`                                           | Status code and headers                                                    |
| `body()`, `json()` / `array()`, `object()`, `collect()`                            | Body as string, array, object, or Collection                               |
| `stream()`, `saveBodyToFile($path)`                                                | Large or binary bodies                                                     |
| `xmlReader()`, `dom()`                                                             | XML (needs `saloonphp/xml-wrangler`) or HTML (needs `symfony/dom-crawler`) |
| `ok()`, `successful()`, `redirect()`, `failed()`, `clientError()`, `serverError()` | Status checks; `failed()` is customizable                                  |
| `throw()`                                                                          | Throw if the response is considered failed                                 |
| `dto()`, `dtoOrFail()`                                                             | Convert to a DTO; see [Data Transfer Objects](data-transfer-objects.md)    |
| `getPendingRequest()`, `getPsrRequest()`, `getPsrResponse()`                       | The built request and the raw PSR-7 messages                               |

## Custom response class

Extend `Response` to add API-specific helpers.
Register the class on the connector for all requests, or on a request for that request only.

```php
use Saloon\Http\Response;

class InventoryResponse extends Response
{
    public function nextPage(): ?int
    {
        return $this->json('meta.next_page');
    }
}

class InventoryConnector extends Connector
{
    protected ?string $response = InventoryResponse::class;
}
```

Override `resolveResponseClass(): string` instead of the property when the class must be chosen dynamically.
