# sendmux-core

[![PyPI version](https://img.shields.io/pypi/v/sendmux-core)](https://pypi.org/project/sendmux-core/)
[![Python versions](https://img.shields.io/pypi/pyversions/sendmux-core)](https://pypi.org/project/sendmux-core/)
[![PyPI downloads](https://img.shields.io/pypi/dm/sendmux-core)](https://pypi.org/project/sendmux-core/)
[![Licence](https://img.shields.io/pypi/l/sendmux-core)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Shared runtime helpers for the Sendmux Python SDK packages.

## Documentation

- Sendmux docs: [sendmux.ai/docs](https://sendmux.ai/docs)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- Python 3.10 or newer.
- A surface package such as `sendmux-sending`, `sendmux-mailbox`, or `sendmux-management` for API operations.

## Installation

```sh
pip install sendmux-core
```

## Usage

Validate an API key prefix and prepare request headers before calling a surface package.

```python
import os

from sendmux_core import conditional_headers, idempotency_headers, validate_api_key

validate_api_key(os.environ["SENDMUX_MAILBOX_API_KEY"], surface="mailbox")

headers = {
    **idempotency_headers("idem_123"),
    **conditional_headers(if_none_match='W/"etag"'),
}
```

## Helpers

- `validate_api_key` checks `smx_root_*` prefixes for root clients, send-capable `smx_mbx_*` prefixes or owner-approved Sending-resource `smx_agent_*` tokens for Sending clients, and mailbox-compatible `smx_mbx_*` or `smx_agent_*` prefixes for Mailbox clients.
- `configure_auth` applies bearer auth to generated client configuration objects.
- `idempotency_headers` and `conditional_headers` prepare request headers.
- `iter_cursor_pages` iterates cursor-paginated list responses.
- `RetryOptions` configures retry behaviour for generated clients.
- `SendmuxApiError` normalises API errors and request IDs.

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the package name, version, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
