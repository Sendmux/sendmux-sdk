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
- A mailbox-scoped key beginning with `smx_mbx_` for sending and mailbox clients.
- A root key beginning with `smx_root_` for management clients.

## Installation

```sh
gem install sendmux-sdk
```

Or add it to your Gemfile:

```ruby
gem "sendmux-sdk", "~> 1.0"
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

## Support

- Documentation: https://sendmux.ai/docs
- Contact: contact@sendmux.ai

## Licence

MIT licence. See https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE.
