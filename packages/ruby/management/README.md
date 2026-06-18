# sendmux-management

[![Gem Version](https://badge.fury.io/rb/sendmux-management.svg)](https://rubygems.org/gems/sendmux-management)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Ruby SDK package for the Sendmux Management API.

## Documentation

- Ruby SDK guide: https://sendmux.ai/docs/sdks/ruby
- Management API reference: https://sendmux.ai/docs/api
- Source: https://github.com/Sendmux/sendmux-sdk/tree/main/packages/ruby/management
- Changelog: https://github.com/Sendmux/sendmux-sdk/blob/main/packages/ruby/management/CHANGELOG.md

## Requirements

- Ruby 3.1 or newer.
- A root Sendmux API key beginning with `smx_root_`.

## Installation

```sh
gem install sendmux-management
```

Or add it to your Gemfile:

```ruby
gem "sendmux-management", "~> 1.0"
```

## Usage

Create a management client with a root key before calling generated operations.

```ruby
require "sendmux/management"

client = Sendmux::Management::Client.new(
  api_key: ENV.fetch("SENDMUX_ROOT_KEY")
)

mailboxes = client.mailboxes.management_list_mailboxes(limit: 25)
domains = client.domains.management_list_domains(limit: 25)

puts mailboxes.data.length
puts domains.data.length
```

### Client surface

`Sendmux::Management::Client` exposes generated API groups:

- `client.billing`
- `client.domain_filters`
- `client.domains`
- `client.emails`
- `client.inboxes`
- `client.mailbox_filters`
- `client.mailboxes`
- `client.sending_accounts`
- `client.webhooks`

Each group exposes generated operation methods using the `management_` prefix, such as `management_list_mailboxes`, `management_create_mailbox`, `management_list_domains`, and `management_create_webhook`.

### Idempotency and conditional requests

Mutating generated operations accept option hashes. Use the core header helpers for idempotency and ETag preconditions.

```ruby
client.webhooks.management_create_webhook(
  Sendmux::Core::Headers.idempotency_key("create-webhook-001").merge(
    webhook_create_body: Sendmux::Management::Generated::WebhookCreateBody.new(
      url: "https://example.com/webhook",
      event_types: ["sendmux.test"]
    )
  )
)

client.domains.management_update_domain(
  "mdom_123",
  Sendmux::Core::Headers.if_match('W/"etag"')
)
```

### Pagination and errors

Use `Sendmux::Core.each_cursor` for list operations that return cursor pagination. Generated API errors are mapped to `Sendmux::Core::ApiError`.

```ruby
pager = Sendmux::Core.each_cursor(lambda do |opts|
  client.mailboxes.management_list_mailboxes(opts.merge(limit: 50))
end)

pager.each { |mailbox| puts mailbox.id }
```

## Support

- Documentation: https://sendmux.ai/docs
- Contact: contact@sendmux.ai

## Licence

MIT licence. See https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE.
