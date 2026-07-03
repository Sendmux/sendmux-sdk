<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

function main(): void
{
    $plan = json_decode((string) getenv('SENDMUX_LIVE_E2E_LANGUAGE_PLAN'), true, flags: JSON_THROW_ON_ERROR);
    $results = [];
    $apis = [];

    foreach ($plan['operations'] as $operation) {
        try {
            $surface = $operation['surface'];
            $apis[$surface] ??= createApis($surface);
            $value = callOperation($apis[$surface], $operation);
            assertResponse($operation, $value);
            $entry = [
                'adapter' => 'php',
                'operationId' => $operation['operationId'],
                'status' => 'passed',
            ];
            $cleanup = cleanupResult($operation, $value);
            if ($cleanup !== null) {
                $entry['cleanup'] = $cleanup;
            }
            $results[] = $entry;
        } catch (Throwable $error) {
            $code = apiErrorCode($error);
            if ($code !== null && in_array($code, $operation['expectedErrorCodes'] ?? [], true)) {
                $results[] = [
                    'adapter' => 'php',
                    'operationId' => $operation['operationId'],
                    'status' => 'passed',
                ];
                continue;
            }
            $results[] = [
                'adapter' => 'php',
                'error' => $error->getMessage(),
                'operationId' => $operation['operationId'],
                'status' => 'failed',
            ];
        }
    }

    echo json_encode(['results' => $results], JSON_PRETTY_PRINT) . PHP_EOL;
}

function createApis(string $surface): array
{
    if ($surface === 'mailbox') {
        return [Sendmux\Mailbox\ClientFactory::createMailboxAPIApi(mailboxApiKey(), appBaseUrl())];
    }
    if ($surface === 'sending') {
        return [
            Sendmux\Sending\ClientFactory::createEmailsApi(mailboxApiKey(), sendingBaseUrl()),
            Sendmux\Sending\ClientFactory::createMetaApi(mailboxApiKey(), sendingBaseUrl()),
        ];
    }
    if ($surface === 'management') {
        return [
            Sendmux\Management\ClientFactory::createBillingApi(rootApiKey(), appBaseUrl()),
            Sendmux\Management\ClientFactory::createDomainFiltersApi(rootApiKey(), appBaseUrl()),
            Sendmux\Management\ClientFactory::createDomainsApi(rootApiKey(), appBaseUrl()),
            Sendmux\Management\ClientFactory::createEmailsApi(rootApiKey(), appBaseUrl()),
            Sendmux\Management\ClientFactory::createInboxesApi(rootApiKey(), appBaseUrl()),
            Sendmux\Management\ClientFactory::createMailboxFiltersApi(rootApiKey(), appBaseUrl()),
            Sendmux\Management\ClientFactory::createMailboxesApi(rootApiKey(), appBaseUrl()),
            Sendmux\Management\ClientFactory::createSendingAccountsApi(rootApiKey(), appBaseUrl()),
            Sendmux\Management\ClientFactory::createWebhooksApi(rootApiKey(), appBaseUrl()),
        ];
    }
    throw new RuntimeException("Unknown surface: {$surface}");
}

function callOperation(array $apis, array $operation): mixed
{
    if ($operation['operationId'] === 'mailboxStreamEvents') {
        return callStreamOperation($apis, $operation);
    }
    if (($operation['responseKind'] ?? '') === 'binary' || $operation['operationId'] === 'mailboxGetMessageAttachment') {
        return callRawOperation($apis, $operation);
    }
    if ($operation['operationId'] === 'mailboxGetChanges') {
        return callRawJsonOperation($apis, $operation);
    }

    $method = $operation['operationId'];
    foreach ($apis as $api) {
        if (!method_exists($api, $method)) {
            continue;
        }
        $args = argsFor(new ReflectionMethod($api, $method), $operation);
        $value = $api->{$method}(...$args);
        return normalise($value);
    }
    throw new RuntimeException("PHP SDK operation {$operation['operationId']} is not exported");
}

function callStreamOperation(array $apis, array $operation): array
{
    return firstSseEvent(callRawOperation($apis, $operation));
}

function callRawJsonOperation(array $apis, array $operation): array
{
    $decoded = json_decode(callRawOperation($apis, $operation), true, flags: JSON_THROW_ON_ERROR);
    if (!is_array($decoded)) {
        throw new RuntimeException("{$operation['operationId']} did not return a JSON object");
    }
    return $decoded;
}

function callRawOperation(array $apis, array $operation): string
{
    $requestMethod = $operation['operationId'] . 'Request';
    foreach ($apis as $api) {
        if (!method_exists($api, $requestMethod)) {
            continue;
        }
        $args = argsFor(new ReflectionMethod($api, $requestMethod), $operation);
        $request = $api->{$requestMethod}(...$args);
        $timeout = operationTimeout($operation);
        $client = new \GuzzleHttp\Client(['timeout' => $timeout]);
        $response = $client->send($request, ['timeout' => $timeout]);
        return (string) $response->getBody();
    }
    throw new RuntimeException("PHP SDK operation {$operation['operationId']} is not exported");
}

function operationTimeout(array $operation): int
{
    if (($operation['operationId'] ?? '') !== 'mailboxStreamEvents') {
        return 40;
    }
    $closeAfter = (int) (($operation['request']['query']['close_after'] ?? 30));
    if ($closeAfter < 30) {
        $closeAfter = 30;
    }
    return $closeAfter + 20;
}

function argsFor(ReflectionMethod $method, array $operation): array
{
    $request = $operation['request'] ?? [];
    $named = [];
    foreach (['path', 'query'] as $source) {
        foreach (($request[$source] ?? []) as $key => $value) {
            $named[parameterName($source, $key)] = $value;
        }
    }
    foreach (($request['headers'] ?? []) as $key => $value) {
        $named[parameterName('headers', $key)] = $value;
    }
    if (array_key_exists('body', $request)) {
        foreach ($method->getParameters() as $parameter) {
            $name = $parameter->getName();
            if (isset($named[$name]) || !isBodyParameter($parameter, $operation)) {
                continue;
            }
            $named[$name] = coerceBody($parameter, $request['body'], $operation);
            break;
        }
    }
    $args = [];
    foreach ($method->getParameters() as $parameter) {
        $name = $parameter->getName();
        if (array_key_exists($name, $named)) {
            $args[$name] = $named[$name];
        }
    }
    return $args;
}

function isBodyParameter(ReflectionParameter $parameter, array $operation): bool
{
    $name = $parameter->getName();
    if ($name === 'contentType') {
        return false;
    }
    if (($operation['bodyKind'] ?? '') === 'binary' && $name === 'body') {
        return true;
    }
    $type = $parameter->getType();
    if ($type instanceof ReflectionNamedType && !$type->isBuiltin()) {
        return true;
    }
    return str_ends_with($name, '_body') || str_ends_with($name, '_request');
}

function coerceBody(ReflectionParameter $parameter, mixed $body, array $operation): mixed
{
    if (($operation['bodyKind'] ?? '') === 'binary') {
        $path = tempnam(sys_get_temp_dir(), 'sendmux-live-e2e-');
        if ($path === false) {
            throw new RuntimeException('Could not create temporary file for binary request body');
        }
        file_put_contents($path, (string) $body);
        return new SplFileObject($path, 'r');
    }
    $type = $parameter->getType();
    if ($type instanceof ReflectionNamedType && !$type->isBuiltin()) {
        $class = $type->getName();
        if (class_exists($class)) {
            return new $class(coerceModelData($class, $body));
        }
    }
    return $body;
}

function coerceModelData(string $class, mixed $body): mixed
{
    if (!is_array($body) || !method_exists($class, 'openAPITypes')) {
        return $body;
    }

    $data = $body;
    foreach ($class::openAPITypes() as $property => $openApiType) {
        if (!array_key_exists($property, $data) || !is_array($data[$property]) || !class_exists($openApiType)) {
            continue;
        }
        if (method_exists($openApiType, 'openAPITypes')) {
            $data[$property] = new $openApiType(coerceModelData($openApiType, $data[$property]));
        }
    }
    return $data;
}

function firstSseEvent(string $body): array
{
    foreach (explode("\n\n", str_replace("\r\n", "\n", $body)) as $block) {
        $data = [];
        foreach (explode("\n", $block) as $line) {
            if (str_starts_with($line, 'data:')) {
                $data[] = trim(substr($line, 5));
            }
        }
        if ($data !== []) {
            return json_decode(implode("\n", $data), true, flags: JSON_THROW_ON_ERROR);
        }
    }
    throw new RuntimeException('mailboxStreamEvents did not yield an SSE data event');
}

function assertResponse(array $operation, mixed $value): void
{
    $operationId = $operation['operationId'];
    if ($operationId === 'mailboxStreamEvents') {
        $eventType = $value['event_type'] ?? $value['event'] ?? null;
        if (!in_array($eventType, ['message.received', 'message.received.spam', 'sync_required'], true)) {
            throw new RuntimeException('mailboxStreamEvents did not return a mailbox realtime event');
        }
        return;
    }
    if (($operation['responseKind'] ?? '') === 'binary' || $operationId === 'mailboxGetMessageAttachment') {
        if ((is_string($value) && $value !== '') || (is_array($value) && $value !== [])) {
            return;
        }
        throw new RuntimeException("{$operationId} did not return binary content");
    }
    if (($operation['responseKind'] ?? null) === 'text') {
        if (!is_string($value) || $value === '') {
            throw new RuntimeException("{$operationId} did not return text");
        }
        return;
    }
    if ($operationId === 'sendingGetOpenApiSpec') {
        if (($value['openapi'] ?? null) !== '3.1.0' || !is_array($value['paths'] ?? null)) {
            throw new RuntimeException('sendingGetOpenApiSpec did not return OpenAPI 3.1');
        }
        return;
    }
    if (($value['ok'] ?? null) !== true) {
        throw new RuntimeException("{$operationId} did not return ok=true");
    }
    if (!is_string($value['meta']['request_id'] ?? null)) {
        throw new RuntimeException("{$operationId} did not return meta.request_id");
    }
}

function cleanupResult(array $operation, mixed $value): ?array
{
    $selectors = $operation['cleanupSelectors'] ?? [];
    $cleanup = [];
    foreach ($selectors as $selector) {
        $selected = valueAtPath($value, $selector);
        if ($selected !== null) {
            setValueAtPath($cleanup, $selector, $selected);
        }
    }
    return $cleanup === [] ? null : $cleanup;
}

function normalise(mixed $value): mixed
{
    if (is_string($value)) {
        return $value;
    }
    if (is_array($value)) {
        return array_map('normalise', $value);
    }
    if (is_object($value) && method_exists($value, 'jsonSerialize')) {
        return normalise($value->jsonSerialize());
    }
    if ($value instanceof stdClass) {
        return normalise(get_object_vars($value));
    }
    return $value;
}

function valueAtPath(mixed $value, string $selector): mixed
{
    $current = $value;
    foreach (explode('.', $selector) as $segment) {
        if (is_array($current) && array_key_exists($segment, $current)) {
            $current = $current[$segment];
        } elseif (is_array($current) && ctype_digit($segment) && array_key_exists((int) $segment, $current)) {
            $current = $current[(int) $segment];
        } elseif ($current instanceof stdClass && property_exists($current, $segment)) {
            $current = $current->{$segment};
        } else {
            return null;
        }
    }
    return $current;
}

function setValueAtPath(array &$target, string $selector, mixed $value): void
{
    $current =& $target;
    $parts = explode('.', $selector);
    $last = count($parts) - 1;
    foreach ($parts as $index => $part) {
        if ($index === $last) {
            $current[$part] = $value;
            return;
        }
        if (!isset($current[$part]) || !is_array($current[$part])) {
            $current[$part] = [];
        }
        $current =& $current[$part];
    }
}

function apiErrorCode(Throwable $error): ?string
{
    $body = method_exists($error, 'getResponseBody') ? $error->getResponseBody() : null;
    if (!is_string($body) || $body === '') {
        return null;
    }
    $decoded = json_decode($body, true);
    return is_array($decoded) ? ($decoded['error']['code'] ?? null) : null;
}

function parameterName(string $source, string $value): string
{
    if ($source === 'headers' && $value === 'Last-Event-ID') {
        return 'last_event_id2';
    }
    return strtolower(str_replace('-', '_', $value));
}

function appBaseUrl(): string
{
    return getenv('SENDMUX_LIVE_E2E_APP_BASE_URL') ?: (getenv('SENDMUX_STAGING_APP_BASE_URL') ?: 'https://app.sendmux.ai/api/v1');
}

function sendingBaseUrl(): string
{
    return getenv('SENDMUX_LIVE_E2E_SENDING_BASE_URL') ?: (getenv('SENDMUX_STAGING_SMTP_BASE_URL') ?: 'https://smtp.sendmux.ai/api/v1');
}

function rootApiKey(): string
{
    return requireAnyEnv('SENDMUX_LIVE_E2E_ROOT_API_KEY', 'SENDMUX_STAGING_ROOT_API_KEY');
}

function mailboxApiKey(): string
{
    return requireAnyEnv('SENDMUX_LIVE_E2E_MAILBOX_API_KEY', 'SENDMUX_STAGING_MAILBOX_API_KEY');
}

function requireAnyEnv(string ...$names): string
{
    foreach ($names as $name) {
        $value = getenv($name);
        if (is_string($value) && $value !== '') {
            return $value;
        }
    }
    throw new RuntimeException('Missing required environment variable: ' . implode(' or ', $names));
}

main();
