# Changelog

## Unreleased

### Security

- Require Guzzle `^7.15.5` and its maintained PSR7 dependency for HTTP security fixes. If you use a custom persistent cookie jar, follow the [upgrade warning](README.md#installation) before updating.

## 2.1.0 (2026-09-11)

- Add REST OAuth access tokens and callable token providers with validation before authenticated requests.
- Respect explicit non-retryable errors and elapsed retry budgets while preserving the final response and retry metadata.

## 2.0.0 (2026-09-08)

- Add a Sending credential surface and support scoped agent tokens for Mailbox and owner-approved Sending access.
