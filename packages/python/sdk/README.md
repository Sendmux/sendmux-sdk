# sendmux-sdk

[![PyPI version](https://img.shields.io/pypi/v/sendmux-sdk)](https://pypi.org/project/sendmux-sdk/)
[![Python versions](https://img.shields.io/pypi/pyversions/sendmux-sdk)](https://pypi.org/project/sendmux-sdk/)
[![PyPI downloads](https://img.shields.io/pypi/dm/sendmux-sdk)](https://pypi.org/project/sendmux-sdk/)
[![Licence](https://img.shields.io/pypi/l/sendmux-sdk)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Optional umbrella package for the Sendmux Python SDK.

## Documentation

- Sendmux docs: [sendmux.ai/docs](https://sendmux.ai/docs)
- Management API reference: [sendmux.ai/docs/api/introduction](https://sendmux.ai/docs/api/introduction)
- Mailbox API reference: [sendmux.ai/docs/mailbox-api/introduction](https://sendmux.ai/docs/mailbox-api/introduction)
- Sending API reference: [sendmux.ai/docs/sending-api/introduction](https://sendmux.ai/docs/sending-api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- Python 3.10 or newer.
- A send-capable `smx_mbx_*` key for Sending clients.
- A mailbox-scoped `smx_mbx_*` key or scoped `smx_agent_*` token for Mailbox clients.
- A root `smx_root_*` key for Management clients.

## Installation

```sh
pip install sendmux-sdk
```

## Usage

```python
import os

from sendmux_sdk import sending

client = sending.create_sending_client(api_key=os.environ["SENDMUX_SENDING_API_KEY"])
api = sending.EmailsApi(client)

response = api.sending_send_email(
    sending.EmailSendRequest(
        var_from=sending.Address(email="sender@example.com"),
        to=sending.Address(email="recipient@example.com"),
        subject="Hello from Sendmux",
        html_body="<p>Hello.</p>",
        text_body="Hello.",
    ),
    idempotency_key="email_123",
)

print(response.data.message_id)
```

The umbrella package lazy-loads:

- `core` from `sendmux_core`
- `sending` from `sendmux_sending`
- `mailbox` from `sendmux_mailbox`
- `management` from `sendmux_management`

Use the per-surface packages directly when an integration only needs one API surface.

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the package name, version, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
