# Connectors

A connector represents one external API. Create one connector per integration under `app/Http/Integrations/<Api>/`.

## Minimal connector

Extend `Saloon\Http\Connector` and implement `resolveBaseUrl()`.

```php
use Saloon\Http\Connector;

class InventoryConnector extends Connector
{
    public function resolveBaseUrl(): string
    {
        return 'https://inventory.example.com/api/v1';
    }
}
```

With the Laravel plugin installed, `php artisan saloon:connector` scaffolds one.

## Constructor arguments and authentication

Pass instance-specific values through the constructor. Put shared bearer authentication in `defaultAuth()`.

```php
use Saloon\Contracts\Authenticator;
use Saloon\Http\Auth\TokenAuthenticator;
use Saloon\Http\Connector;

class InventoryConnector extends Connector
{
    public function __construct(
        protected readonly string $baseUrl,
        protected readonly string $token,
    ) {}

    public function resolveBaseUrl(): string
    {
        return $this->baseUrl;
    }

    protected function defaultAuth(): ?Authenticator
    {
        return new TokenAuthenticator($this->token);
    }
}

$connector = new InventoryConnector(config('services.inventory.url'), config('services.inventory.token'));
```

`TokenAuthenticator` sends `Authorization: Bearer <token>`.
Load credentials from configuration or secrets. Never hard-code production credentials.

## Default headers

Override `defaultHeaders()` for headers every request needs. Request headers are merged on top.

```php
protected function defaultHeaders(): array
{
    return [
        'Accept' => 'application/json',
        'Content-Type' => 'application/json',
    ];
}
```

Change headers on an instance with `$connector->headers()->add('X-Tenant', 'acme');`.

## Timeouts

Defaults are a 10-second connection timeout and a 30-second request timeout.
Use `HasTimeout` on a connector for shared timeouts, or on a request for endpoint-specific timeouts.

```php
use Saloon\Traits\Plugins\HasTimeout;

class InventoryConnector extends Connector
{
    use HasTimeout;

    protected int $connectTimeout = 60;

    protected int $requestTimeout = 120;
}
```

## HTTP client config

The default sender is Guzzle. Pass Guzzle request options through `defaultConfig()` or `$connector->config()->add(...)`.

```php
public function defaultConfig(): array
{
    return ['verify' => true];
}
```
