# sendmux-sdk

[![Gem Version](https://badge.fury.io/rb/sendmux-sdk.svg)](https://rubygems.org/gems/sendmux-sdk)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Umbrella Ruby SDK package for Sendmux.

## Documentation

- Ruby SDK guide: https://sendmux.ai/docs/sdks/ruby
- Source: https://github.com/Sendmux/sendmux-sdk/tree/main/packages/ruby/sdk
- Changelog: https://github.com/Sendmux/sendmux-sdk/blob/main/packages/ruby/sdk/CHANGELOG.md

## Requirements

- Ruby 3.1 or newer.
- A send-capable `smx_mbx_` key or owner-approved Sending-resource `smx_agent_` token for sending clients.
- A mailbox-scoped key beginning with `smx_mbx_` or scoped token beginning with `smx_agent_` for mailbox clients.
- A root key beginning with `smx_root_` for management clients.

For OAuth, use a REST access token with the scopes and mailbox access required by the operation. See [OAuth for REST APIs](https://sendmux.ai/docs/developer-tools/oauth).

## Installation

```sh
gem install sendmux-sdk
```

Or add it to your Gemfile:

```ruby
gem "sendmux-sdk", "~> 1.0"
```

## OAuth access tokens

Pass either `api_key:` or `access_token:`. `access_token:` accepts a bare token string or a callable; the callable is evaluated once per authenticated request. Your application owns token storage, expiry checks and refresh coordination.

```ruby
require "sendmux/sdk"

client = Sendmux::SDK.management(
  access_token: -> { ENV.fetch("SENDMUX_ACCESS_TOKEN") }
)
```

## Usage

Use the umbrella gem when you want all Ruby SDK surfaces in one install.

```ruby
require "sendmux/sdk"

sending = Sendmux::SDK.sending(
  api_key: ENV.fetch("SENDMUX_MAILBOX_KEY")
)

mailbox = Sendmux::SDK.mailbox(
  api_key: ENV.fetch("SENDMUX_MAILBOX_KEY")
)

management = Sendmux::SDK.management(
  api_key: ENV.fetch("SENDMUX_ROOT_KEY")
)

puts sending.emails.class
puts mailbox.mailbox_api.class
puts management.mailboxes.class
```

`Sendmux::Sdk` is available as an alias for `Sendmux::SDK`.

### Surface clients

The umbrella package installs and re-exports:

- `sendmux-core`
- `sendmux-sending`
- `sendmux-mailbox`
- `sendmux-management`

The helper methods return the same clients exposed by the surface gems:

- `Sendmux::SDK.sending(...)` returns `Sendmux::Sending::Client`.
- `Sendmux::SDK.mailbox(...)` returns `Sendmux::Mailbox::Client`.
- `Sendmux::SDK.management(...)` returns `Sendmux::Management::Client`.

### Retries, pagination, and errors

Pass `Sendmux::Core::RetryOptions` through any umbrella helper. Use `Sendmux::Core.each_cursor` and `Sendmux::Core::Headers` with the generated operation methods exactly as you would with the surface gems.

```ruby
retry_options = Sendmux::Core::RetryOptions.new(max_attempts: 4)

management = Sendmux::SDK.management(
  api_key: ENV.fetch("SENDMUX_ROOT_KEY"),
  retry_options: retry_options
)

pager = Sendmux::Core.each_cursor(lambda do |opts|
  management.mailboxes.management_list_mailboxes(opts.merge(limit: 50))
end)

pager.each { |mailbox| puts mailbox.id }
```

Generated API errors are mapped to `Sendmux::Core::ApiError`.

## Version 2 migration candidate

Version 2 is not published yet. The umbrella Mailbox client adopts the thread-specific list response: thread-message results require `meta.thread_id` and expose optional typed `meta.sync_state`, while ordinary message-list results remain thread-independent. Other Mailbox list families expose typed state metadata where applicable.

The Management dependency requires `sendmux-management >= 2.0.0, < 3.0`. Sending-account list entries change from `Sendmux::Management::Generated::ProviderItem` to `ProviderListItem`; detail results require `variables`. The client returned by `Sendmux::SDK.management(...)` uses the same operations and classes described in [the Management 2.0 migration steps](../management/README.md#migrate-from-1x-to-20).

When the release is available, update `sendmux-sdk`, `sendmux-mailbox`, `sendmux-management`, the bundle lock, and affected call sites or fixtures together. To roll back, restore the previous gem requirements, lock, and call sites together.

## Support

- Documentation: https://sendmux.ai/docs
- Contact: contact@sendmux.ai

## Licence

MIT licence. See https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE.
