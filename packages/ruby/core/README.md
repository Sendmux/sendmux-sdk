# sendmux-core

[![Gem Version](https://badge.fury.io/rb/sendmux-core.svg)](https://rubygems.org/gems/sendmux-core)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Shared authentication, retry, pagination, header, and error helpers for the Sendmux Ruby SDK packages.

## Documentation

- Ruby SDK guide: https://docs.sendmux.ai/sdks/ruby
- Source: https://github.com/Sendmux/sendmux-sdk/tree/main/packages/ruby/core
- Changelog: https://github.com/Sendmux/sendmux-sdk/blob/main/packages/ruby/core/CHANGELOG.md

## Requirements

- Ruby 3.1 or newer.
- A Sendmux API key when using the helpers with a surface client.

## Installation

```sh
gem install sendmux-core
```

Or add it to your Gemfile:

```ruby
gem "sendmux-core", "~> 1.0"
```

## Usage

The core package is installed automatically by the surface gems, but it can also be used directly when you need shared helpers.

```ruby
require "sendmux/core"

surface = Sendmux::Core::Auth.assert_api_key_surface(
  ENV.fetch("SENDMUX_ROOT_KEY"),
  Sendmux::Core::ApiKeySurface::ROOT
)

puts surface
```

Use `Sendmux::Core::ApiKeySurface::ROOT` for root-key management clients and `Sendmux::Core::ApiKeySurface::MAILBOX` for mailbox-key sending and mailbox clients.

### Header helpers

Generated Ruby operations accept option hashes. The header helpers return the option keys expected by those generated operations.

```ruby
headers = Sendmux::Core::Headers.idempotency_key("idem_123")
etag = Sendmux::Core::Headers.if_match('W/"etag"')
conditional = Sendmux::Core::Headers.conditional(if_none_match: 'W/"cached"')
```

### Cursor pagination

`Sendmux::Core.each_cursor` wraps any generated list call that accepts a cursor option and returns Sendmux pagination metadata.

```ruby
pager = Sendmux::Core.each_cursor(lambda do |opts|
  mailbox_client.mailbox_api.mailbox_list_messages(opts.merge(limit: 50))
end)

pager.each do |message|
  puts message.id
end
```

### Retries and errors

Surface clients accept `Sendmux::Core::RetryOptions` and map generated errors to `Sendmux::Core::ApiError`.

```ruby
retry_options = Sendmux::Core::RetryOptions.new(max_attempts: 4)

begin
  # Pass retry_options: retry_options to any Sendmux surface client.
  # Call a generated operation here.
  nil
rescue Sendmux::Core::ApiError => error
  warn "#{error.code}: #{error.message} (request #{error.request_id})"
end
```

Retries are enabled for safe requests and for idempotent `POST` requests that use an `Idempotency-Key`.

## Support

- Documentation: https://docs.sendmux.ai
- Contact: contact@sendmux.ai

## Licence

MIT licence. See https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE.
