# Sending Requests

Pass a request to its connector to send it.

## Synchronous

```php
$connector = new InventoryConnector($baseUrl, $token);

$response = $connector->send(new ListProductsRequest);

$products = $response->json('data');
```

`send()` returns a `Saloon\Http\Response`. A 4xx/5xx status does **not** throw by default; see [Handling Failures](handling-failures.md).

## Asynchronous

`sendAsync()` returns a Guzzle `PromiseInterface`.
Successful responses reach `then`. HTTP and connection failures reject the promise and reach `otherwise`.

```php
use Saloon\Exceptions\Request\FatalRequestException;
use Saloon\Exceptions\Request\RequestException;
use Saloon\Http\Response;

$promise = $connector->sendAsync(new ListProductsRequest);

$promise
    ->then(function (Response $response) {
        // handle success
    })
    ->otherwise(function (FatalRequestException|RequestException $exception) {
        // RequestException: the API returned 4xx/5xx; use $exception->getResponse()
        // FatalRequestException: no response, e.g. connection failure
    });

$promise->wait(); // resolve the promise
```

For concurrent batches, read [Concurrency and pools](concurrency-and-pools.md).
For failure classification and custom exceptions, read [Handling failures](handling-failures.md).
