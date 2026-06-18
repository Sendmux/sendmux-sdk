# sendmux-management

[![PyPI version](https://img.shields.io/pypi/v/sendmux-management)](https://pypi.org/project/sendmux-management/)
[![Python versions](https://img.shields.io/pypi/pyversions/sendmux-management)](https://pypi.org/project/sendmux-management/)
[![PyPI downloads](https://img.shields.io/pypi/dm/sendmux-management)](https://pypi.org/project/sendmux-management/)
[![Licence](https://img.shields.io/pypi/l/sendmux-management)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Generated Python client for the Sendmux Management API.

## Documentation

- Management API reference: [sendmux.ai/docs/api/introduction](https://sendmux.ai/docs/api/introduction)
- Source repository: [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk)

## Requirements

- Python 3.10 or newer.
- A root Sendmux API key with the `smx_root_*` prefix.

## Installation

```sh
pip install sendmux-management
```

## Usage

```python
import os

from sendmux_management import DomainsApi, create_management_client

client = create_management_client(api_key=os.environ["SENDMUX_MANAGEMENT_API_KEY"])
api = DomainsApi(client)

domains = api.management_list_domains(limit=25)

for domain in domains.data:
    print(domain.id, domain.domain)
```

The package exports every generated Management model and API class plus:

- `create_management_client`
- `configure_management`
- `SendmuxManagementApiClient`

## Conditional requests

Generated methods expose ETag parameters directly when the API operation supports them.

```python
import os

from sendmux_management import DomainsApi, create_management_client

client = create_management_client(api_key=os.environ["SENDMUX_MANAGEMENT_API_KEY"])
api = DomainsApi(client)

domain = api.management_get_domain(
    public_id="mdom_123",
    if_none_match='W/"etag"',
)

print(domain.data)
```

## Support

Open an issue in [Sendmux/sendmux-sdk](https://github.com/Sendmux/sendmux-sdk/issues) with the package name, version, and request ID from any API error.

## Licence

MIT. See the [licence file](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE).
