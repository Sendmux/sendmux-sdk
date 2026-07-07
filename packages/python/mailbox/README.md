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

from sendmux_mailbox import MailboxAPIApi, create_mailbox_client, iter_mailbox_events

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
- `iter_mailbox_events`
- file helpers: `upload_mailbox_attachment_from_file`, `create_mailbox_attachment_upload_from_file`, `upload_mailbox_attachment_via_presigned_file`, and `send_mailbox_message_with_files`

## Attachments

Message and event attachment metadata includes `download_url`, a short-lived presigned URL for that single attachment. Prefer `download_mailbox_attachment()` or `read_mailbox_text_attachment()` when you already have an authenticated client. Plain HTTP clients can fetch `download_url` promptly with no `Authorization` header; if it expires, call `mailbox_get_message()` or list/search messages again to receive fresh metadata.

Mailbox direct uploads, presigned uploads, and file helpers share the mailbox attachment cap, currently `7,500,000` bytes per attachment. Presigned uploads also pin the exact declared byte length and content type.

```python
import os
import urllib.request

from sendmux_mailbox import MailboxAPIApi, create_mailbox_client, read_mailbox_text_attachment

client = create_mailbox_client(api_key=os.environ["SENDMUX_MAILBOX_API_KEY"])
api = MailboxAPIApi(client)

message = api.mailbox_get_message("msg_123")
attachment = message.data.attachments[0]
content = urllib.request.urlopen(attachment.download_url, timeout=30).read()
text = read_mailbox_text_attachment(
    client,
    message_id="msg_123",
    attachment_id=attachment.id,
)

upload = api.mailbox_upload_attachment(
    body=b"hello\n",
    filename="hello.txt",
    _headers={"Content-Type": "text/plain"},
)

api.mailbox_send_message(
    send_mailbox_message_body={
        "to": [{"email": "recipient@example.com", "name": None}],
        "subject": "Attachment",
        "text_body": "See attached.",
        "attachments": [{
            "blob_id": upload.data.blob_id,
            "filename": "hello.txt",
            "content_type": "text/plain",
        }],
    },
)
```

For local files, use helper functions so file bytes stay out of model context:

```python
import os

from sendmux_mailbox import create_mailbox_client, send_mailbox_message_with_files

client = create_mailbox_client(api_key=os.environ["SENDMUX_MAILBOX_API_KEY"])

send_mailbox_message_with_files(
    client,
    files=["./report.pdf"],
    idempotency_key="report-123",
    body={
        "to": [{"email": "recipient@example.com", "name": None}],
        "subject": "Report",
        "text_body": "Attached.",
    },
)
```

Use `upload_mailbox_attachment_via_presigned_file(...)` when you want the upload step to use the short-lived signed URL and no API key on the file `PUT`. Inline base64 attachments remain available for tiny generated sends through the generated `attachments[].content` body shape.

## Events

Use `iter_mailbox_events` for typed server-sent mailbox events.

```python
for event in iter_mailbox_events(
    client,
    close_after=300,
    event_types="message.received",
):
    print(event.event_type, event.message_id)
```

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
