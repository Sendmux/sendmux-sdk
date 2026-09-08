# Changelog

## 2.0.0 (2026-09-08)

- Add `managementGetConnection()` and the connection client factory.
- Update generated Management API models and require core 2.0.
- Reject malformed JSON consistently in synchronous and asynchronous responses.
- Validate missing required fields without passing null to string or pattern constraints.
- Breaking: delivery-log detail data uses `DeliveryLogDetail`, and mailbox update scopes use `UpdateMailboxBodySendScope`; see the [migration guide](https://github.com/Sendmux/sendmux-sdk/blob/main/packages/php/UPGRADING.md).
