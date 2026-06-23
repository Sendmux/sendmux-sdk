# sendmux-sending

[![PyPI version](https://img.shields.io/pypi/v/sendmux-sending)](https://pypi.org/project/sendmux-sending/)
[![Python versions](https://img.shields.io/pypi/pyversions/sendmux-sending)](https://pypi.org/project/sendmux-sending/)
[![PyPI downloads](https://img.shields.io/pypi/dm/sendmux-sending)](https://pypi.org/project/sendmux-sending/)
[![Licence](https://img.shields.io/pypi/l/sendmux-sending)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Generated Python client for the Sendmux Sending API.

## Documentation

- Sending API reference: [sendmux.ai/docs/sending-api/introduction](https://sendmux.ai/docs/sending-api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- Python 3.10 or newer.
- A send-capable Sendmux API key with the `smx_mbx_*` prefix.

## Installation

```sh
pip install sendmux-sending
```

## Usage

```python
import os

from sendmux_sending import Address, EmailSendRequest, EmailsApi, create_sending_client

client = create_sending_client(api_key=os.environ["SENDMUX_SENDING_API_KEY"])
api = EmailsApi(client)

response = api.sending_send_email(
    EmailSendRequest(
        var_from=Address(email="sender@example.com"),
        to=Address(email="recipient@example.com"),
        subject="Hello from Sendmux",
        html_body="<p>Hello.</p>",
        text_body="Hello.",
    ),
    idempotency_key="email_123",
)

print(response.data.message_id)
```

The package exports every generated Sending model and API class plus:

- `create_sending_client`
- `configure_sending`
- `SendmuxSendingApiClient`

## Request helpers

Use `sendmux-core` when you need explicit idempotency, conditional request, pagination, retry, or typed-error helpers. The generated Sending client already uses the shared retry and error mapper.

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the package name, version, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
