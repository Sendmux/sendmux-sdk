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
- A send-capable `smx_mbx_*` key or owner-approved Sending-resource `smx_agent_*` token for Sending clients.
- A mailbox-scoped `smx_mbx_*` key or scoped `smx_agent_*` token for Mailbox clients.
- A root `smx_root_*` key for Management clients.

For OAuth, use a REST access token with the scopes and mailbox access required by the operation. See [OAuth for REST APIs](https://sendmux.ai/docs/developer-tools/oauth).

## Installation

```sh
pip install sendmux-sdk
```

## Connection checks

Check a Management credential without creating resources:

```python
import os

from sendmux_sdk import management

with management.create_management_client(
    api_key=os.environ["SENDMUX_MANAGEMENT_API_KEY"]
) as client:
    connection = management.ConnectionApi(client).management_get_connection()
    print(connection.data.label, connection.data.team.id)
```

Use `data.label` for the connection name and `data.team.id` for its stable team
identifier. Each API surface has its own connection operation:

| Surface | API class | Method |
| --- | --- | --- |
| Management | `management.ConnectionApi` | `management_get_connection()` |
| Mailbox | `mailbox.MailboxAPIApi` | `mailbox_get_connection()` |
| Sending | `sending.MetaApi` | `sending_get_connection()` |

Create each client with the credential for that surface.

## OAuth access tokens

Pass either `api_key` or `access_token`. `access_token` accepts a bare token string or a synchronous callable; the callable is evaluated for each authenticated request. Your application owns token storage, expiry checks and refresh coordination.

```python
import os

from sendmux_sdk import management

client = management.create_management_client(
    access_token=lambda: os.environ["SENDMUX_ACCESS_TOKEN"]
)
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
