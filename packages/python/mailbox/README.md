# sendmux-mailbox

[![PyPI version](https://img.shields.io/pypi/v/sendmux-mailbox)](https://pypi.org/project/sendmux-mailbox/)
[![Python versions](https://img.shields.io/pypi/pyversions/sendmux-mailbox)](https://pypi.org/project/sendmux-mailbox/)
[![PyPI downloads](https://img.shields.io/pypi/dm/sendmux-mailbox)](https://pypi.org/project/sendmux-mailbox/)
[![Licence](https://img.shields.io/pypi/l/sendmux-mailbox)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Generated Python client for the Sendmux Mailbox API.

## Documentation

- Mailbox API reference: [sendmux.ai/docs/mailbox-api/introduction](https://sendmux.ai/docs/mailbox-api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- Python 3.10 or newer.
- A mailbox-scoped `smx_mbx_*` key or scoped `smx_agent_*` token.

## Installation

```sh
pip install sendmux-mailbox
```

## Usage

```python
import os

from sendmux_mailbox import MailboxAPIApi, create_mailbox_client

client = create_mailbox_client(api_key=os.environ["SENDMUX_MAILBOX_API_KEY"])
api = MailboxAPIApi(client)

messages = api.mailbox_list_messages(limit=25)

for message in messages.data:
    print(message.id, message.subject)
```

The package exports every generated Mailbox model and API class plus:

- `create_mailbox_client`
- `configure_mailbox`
- `SendmuxMailboxApiClient`

## Pagination

Use `iter_cursor_pages` from `sendmux-core` with list operations that return cursor pagination.

```python
import os

from sendmux_core import iter_cursor_pages
from sendmux_mailbox import MailboxAPIApi, create_mailbox_client

client = create_mailbox_client(api_key=os.environ["SENDMUX_MAILBOX_API_KEY"])
api = MailboxAPIApi(client)

for message in iter_cursor_pages(lambda cursor: api.mailbox_list_messages(cursor=cursor, limit=50)):
    print(message.id)
```

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the package name, version, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
