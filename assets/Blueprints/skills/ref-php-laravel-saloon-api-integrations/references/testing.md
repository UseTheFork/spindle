# Testing

Keep test runs offline. Use `MockClient` with fake responses or existing fixtures.
Assert the outgoing request and the application's handling of success and failure responses, including 401, 422, and 500.

## Block network access

Block requests without a mock client and prevent automatic recording when a fixture is missing.
For Pest, add this setup to `tests/Pest.php`.
For PHPUnit, run it in the base `TestCase::setUp()` after `parent::setUp()`.

```php
use Saloon\Config;
use Saloon\MockConfig;

Config::preventStrayRequests();
MockConfig::throwOnMissingFixtures();
```

`preventStrayRequests()` alone does not stop fixture recording when a mock client is attached.
`throwOnMissingFixtures()` throws `FixtureMissingException` instead of recording a missing fixture.

## Fake responses

`MockResponse::make(body, status, headers)` builds a response. An array body is encoded as JSON.

```php
use Saloon\Http\Faking\MockClient;
use Saloon\Http\Faking\MockResponse;

$mockClient = new MockClient([
    ListProductsRequest::class => MockResponse::make(['data' => [['id' => 1, 'name' => 'Widget']]], 200),
    CreateProductRequest::class => MockResponse::make(['errors' => ['name' => ['Required']]], 422),
]);
```

Mock keys can also be:

- URL patterns with `*` wildcards: `'inventory.example.com/api/v1/products/*' => MockResponse::make(...)`.
- An unkeyed list, returned in sequence regardless of the request: `[MockResponse::make('first'), MockResponse::make('second')]`.
- A closure: `fn (PendingRequest $pendingRequest) => MockResponse::make(...)`.

## Attach the mock

**Local**: attach the mock to a connector or request you control.

```php
$connector = new InventoryConnector('https://inventory.example.com/api/v1', 'test-token');
$connector->withMockClient($mockClient);
```

**Global**: mock requests sent deep inside application code.

```php
$mockClient = MockClient::global([
    ListProductsRequest::class => MockResponse::make(['data' => []], 200),
]);
```

Without the Laravel plugin, reset global mocks between tests with `MockClient::destroyGlobal()` in `beforeEach` or `setUp`.
The Laravel plugin resets them automatically.

## Assertions

```php
use Saloon\Http\Request;
use Saloon\Http\Response;

$mockClient->assertSent(ListProductsRequest::class);
$mockClient->assertNotSent(CreateProductRequest::class);
$mockClient->assertSentCount(1);
$mockClient->assertSentCount(1, ListProductsRequest::class);
```

These are separate assertion examples. Use `assertNothingSent()` when no request should leave the application.
For a connector configured with `test-token`, assert the actual bearer header rather than a masked placeholder:

```php
$token = 'test-token';

$mockClient->assertSent(function (Request $request, Response $response) use ($token) {
    return $request instanceof CreateProductRequest
        && $request->body()->all() === ['name' => 'Widget', 'price_cents' => 999]
        && $response->getPsrRequest()->getHeaderLine('Authorization') === ('Bearer ' . $token);
});
```

## Complete example: a failure path

```php
it('reports validation errors when the inventory API rejects a product', function () {
    $mockClient = MockClient::global([
        CreateProductRequest::class => MockResponse::make(['errors' => ['name' => ['Required']]], 422),
    ]);

    $result = app(ProductSync::class)->create(name: '', priceCents: 0);

    expect($result->errors)->toBe(['name' => ['Required']]);

    $mockClient->assertSent(fn (Request $request) => $request instanceof CreateProductRequest
        && $request->body()->get('name') === '');
});
```

A synchronous 422 returns a response rather than throwing.
If the code under test calls `throw()` or uses `AlwaysThrowOnErrors`, assert the exception instead.
See [Handling failures](handling-failures.md).

## Fixtures

`MockResponse::fixture('inventory/products')` replays `tests/Fixtures/Saloon/inventory/products.json` when the file exists.
With the setup above, a missing file fails the test without contacting the API.
Change the directory with `MockConfig::setFixturePath('tests/fixtures/http')`.

Record fixtures only through an explicitly authorized process outside normal test runs and CI.
That process must omit `throwOnMissingFixtures()` and use credentials restricted to recording.
Without that guard, a missing fixture triggers a real API call and saves the response.
Use lowercase fixture paths. Redact secrets before committing fixture files.
To refresh a fixture, delete only its file in the recording process.
