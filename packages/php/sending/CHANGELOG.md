# Changelog

## 2.0.0 (2026-09-08)

- Add `sendingGetConnection()` for side-effect-free connection checks.
- Include attachment upload clients and current generated models.
- Require core 2.0 for the Sending credential surface and owner-approved agent tokens.
- Reject malformed JSON consistently in synchronous and asynchronous responses.
- Validate missing required fields without passing null to string or pattern constraints.
