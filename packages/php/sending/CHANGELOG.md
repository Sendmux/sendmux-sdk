# Changelog

## 2.0.0 (2026-09-08)

- Add `sendingGetConnection()` for side-effect-free connection checks.
- Include attachment upload clients and current generated models.
- Require core 2.0 for the Sending credential surface and owner-approved agent tokens.
- Reject malformed JSON consistently in synchronous and asynchronous responses.
- Validate missing required fields without passing null to string or pattern constraints.
- Preserve inline and uploaded attachment forms without requiring fields from both variants; nullable attachment getters and omitted encoding defaults are documented in the [migration guide](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/php/UPGRADING.md).
