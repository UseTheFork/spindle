# Concurrency & Pools

A pool sends independent requests concurrently through one connector.
Use pools for batches such as fetching records by ID.
Concurrency requires `GuzzleSender` (the default) or `HttpSender`.

## Basic pool

```php
use Saloon\Exceptions\Request\FatalRequestException;
use Saloon\Exceptions\Request\RequestException;
use Saloon\Http\Response;

$products = [];
$failures = [];

$pool = $connector->pool(
    requests: function () use ($ids): Generator {
        foreach ($ids as $id) {
            yield $id => new GetProductRequest($id);
        }
    },
    concurrency: 10,
    responseHandler: function (Response $response, int|string $key) use (&$products) {
        $products[$key] = $response->dtoOrFail();
    },
    exceptionHandler: function (FatalRequestException|RequestException $exception, int|string $key) use (&$failures) {
        $failures[$key] = $exception instanceof RequestException
            ? $exception->getResponse()->status()
            : $exception->getMessage();
    },
);

$pool->send()->wait();
```

`send()` returns a promise; call `wait()` before reading the results.

## Requests

Provide any of the following as the first argument or with `setRequests()`:

- An array of `Request` or `PendingRequest` objects.
- A generator, to keep memory low for large batches.
- A closure or invokable class returning an array or generator, to run setup just before sending.

Keys from arrays or generators reach both handlers, so key by ID to match results. Responses complete in any order; never rely on input order.

## Concurrency

The default is 5 requests in flight.
Use the `concurrency` argument or `$pool->setConcurrency(10)` to change it. Both also accept a callable.
Choose a value that respects the API's rate limits. A pool does not throttle requests over time.

## Handlers

- `responseHandler` / `withResponseHandler()`: receives each **successful** `Response`.
- `exceptionHandler` / `withExceptionHandler()`: receives `RequestException` for 4xx/5xx responses and `FatalRequestException` for connection failures. HTTP failures always arrive here, even without `throw()` or `AlwaysThrowOnErrors`.

Each pool holds one handler of each kind.
For failure classification and custom exceptions, read [Handling failures](handling-failures.md).

## Testing pools

Use `MockClient` with pools. Mocked HTTP failures reach the exception handler.
For offline setup and request assertions, read [Testing](testing.md).

```php
$connector->withMockClient(new MockClient([
    MockResponse::make(['id' => 1, 'name' => 'Widget', 'price_cents' => 999], 200),
    MockResponse::make(['message' => 'Not found'], 404),
]));
```
