# Handling Failures

Saloon separates two kinds of failure:

- **HTTP failure**: the API returned 4xx/5xx. Synchronous `send()` returns a `Response` with `failed()` set to `true`, unless throwing is enabled.
- **Connection failure**: the API returned no response, such as a DNS error or connection timeout. Saloon throws `FatalRequestException`.

```php
$response = $connector->send(new CreateProductRequest('Widget', 999));

if ($response->failed()) {
    $errors = $response->json('errors'); // e.g. a 422 validation payload
}
```

## Throwing on HTTP failures

Call `throw()` to throw on a failed response. It returns the response on success.

```php
$product = $connector->send(new GetProductRequest(42))->throw()->json();
```

For every request on a connector, add `AlwaysThrowOnErrors`.

```php
use Saloon\Traits\Plugins\AlwaysThrowOnErrors;

class InventoryConnector extends Connector
{
    use AlwaysThrowOnErrors;
}
```

## Exception hierarchy

Catch the most specific type the application needs. `RequestException` exposes the response through `getResponse()`.

```
SaloonException
├── FatalRequestException            connection errors, no response
└── RequestException                 HTTP 4xx/5xx
    ├── ClientException              4xx
    │   ├── UnauthorizedException (401), PaymentRequiredException (402)
    │   ├── ForbiddenException (403), NotFoundException (404)
    │   ├── MethodNotAllowedException (405), RequestTimeOutException (408)
    │   └── UnprocessableEntityException (422), TooManyRequestsException (429)
    └── ServerException              5xx
        └── InternalServerErrorException (500), ServiceUnavailableException (503), GatewayTimeoutException (504)
```

```php
use Saloon\Exceptions\Request\Statuses\UnprocessableEntityException;

try {
    $connector->send(new CreateProductRequest('', 0))->throw();
} catch (UnprocessableEntityException $e) {
    $errors = $e->getResponse()->json('errors');
}
```

## Async and pools

Promises from `sendAsync()` and pools reject on HTTP and connection failures.
Handle both in `otherwise` or the pool's exception handler. Calling `throw()` is unnecessary.
For callback examples, read [Sending requests](sending-requests.md) or [Concurrency and pools](concurrency-and-pools.md).

## Custom failure detection

Some APIs return 200 with an error in the body. Override `hasRequestFailed()` on the connector or request; returning `null` falls back to the status-code check.

```php
use Saloon\Http\Response;

public function hasRequestFailed(Response $response): ?bool
{
    return $response->json('status') === 'error';
}
```

This changes `failed()`, `throw()`, `dtoOrFail()`, and `AlwaysThrowOnErrors`.

## Custom exception

Override `getRequestException()` on the connector or request to throw an application exception. A request's override wins over the connector's.

```php
use Saloon\Http\Response;
use Throwable;

public function getRequestException(Response $response, ?Throwable $senderException): ?Throwable
{
    return new InventoryApiException($response->json('message', 'Inventory API error'), $response->status(), $senderException);
}
```
