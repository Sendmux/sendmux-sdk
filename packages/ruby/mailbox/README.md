# sendmux-mailbox

[![Gem Version](https://badge.fury.io/rb/sendmux-mailbox.svg)](https://rubygems.org/gems/sendmux-mailbox)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Ruby SDK package for the Sendmux Mailbox API.

## Documentation

- Ruby SDK guide: https://sendmux.ai/docs/sdks/ruby
- Mailbox API reference: https://sendmux.ai/docs/mailbox-api
- Source: https://github.com/Sendmux/sendmux-sdk/tree/main/packages/ruby/mailbox
- Changelog: https://github.com/Sendmux/sendmux-sdk/blob/main/packages/ruby/mailbox/CHANGELOG.md

## Requirements

- Ruby 3.1 or newer.
- A mailbox-scoped `smx_mbx_` key or scoped `smx_agent_` token.

## Installation

```sh
gem install sendmux-mailbox
```

Or add it to your Gemfile:

```ruby
gem "sendmux-mailbox", "~> 1.0"
```

## Usage

Create a mailbox client with a mailbox key or scoped agent token before calling generated operations.

```ruby
require "sendmux/mailbox"

client = Sendmux::Mailbox::Client.new(
  api_key: ENV.fetch("SENDMUX_MAILBOX_KEY")
)

me = client.mailbox_api.mailbox_get_me
messages = client.mailbox_api.mailbox_list_messages(limit: 25)

puts me.data.email
puts messages.data.length
```

### Client surface

`Sendmux::Mailbox::Client` exposes `client.mailbox_api`, which contains generated mailbox operations such as:

- `mailbox_get_me`
- `mailbox_list_messages`
- `mailbox_get_message`
- `mailbox_send_message`
- `mailbox_list_threads`
- `mailbox_upload_attachment`

When a key grants access to more than one mailbox, pass `mailbox_id:` to operations that accept it.

### Pagination and conditional requests

Use `Sendmux::Core.each_cursor` for list operations that return cursor pagination. Use the ETag helpers for generated operations that accept `:if_match` or `:if_none_match`.

```ruby
pager = Sendmux::Core.each_cursor(lambda do |opts|
  client.mailbox_api.mailbox_list_messages(opts.merge(limit: 50))
end)

pager.each { |message| puts message.id }

client.mailbox_api.mailbox_delete_message(
  "msg_123",
  Sendmux::Core::Headers.if_match('W/"etag"')
)
```

### Errors

Generated API errors are mapped to `Sendmux::Core::ApiError`.

```ruby
begin
  client.mailbox_api.mailbox_get_message("msg_123")
rescue Sendmux::Core::ApiError => error
  warn "#{error.status} #{error.code}: #{error.message}"
end
```

## Support

- Documentation: https://sendmux.ai/docs
- Contact: contact@sendmux.ai

## Licence

MIT licence. See https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE.
