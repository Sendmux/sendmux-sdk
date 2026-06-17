# sendmux-sending

[![Gem Version](https://badge.fury.io/rb/sendmux-sending.svg)](https://rubygems.org/gems/sendmux-sending)
[![CI](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sendmux/sendmux-sdk/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE)

Ruby SDK package for the Sendmux Sending API.

## Documentation

- Ruby SDK guide: https://docs.sendmux.ai/sdks/ruby
- Sending API reference: https://docs.sendmux.ai/sending-api
- Source: https://github.com/Sendmux/sendmux-sdk/tree/main/packages/ruby/sending
- Changelog: https://github.com/Sendmux/sendmux-sdk/blob/main/packages/ruby/sending/CHANGELOG.md

## Requirements

- Ruby 3.1 or newer.
- A mailbox-scoped Sendmux API key beginning with `smx_mbx_`.

## Installation

```sh
gem install sendmux-sending
```

Or add it to your Gemfile:

```ruby
gem "sendmux-sending", "~> 1.0"
```

## Usage

Create a sending client with a mailbox key before calling generated operations.

```ruby
require "sendmux/sending"

client = Sendmux::Sending::Client.new(
  api_key: ENV.fetch("SENDMUX_MAILBOX_KEY")
)

request = Sendmux::Sending::Generated::EmailSendRequest.new(
  from: Sendmux::Sending::Generated::Address.new(email: "sender@example.com"),
  to: Sendmux::Sending::Generated::Address.new(email: "recipient@example.com"),
  subject: "Hello from Sendmux",
  text_body: "This message was sent with the Sendmux Ruby SDK."
)

response = client.emails.sending_send_email(
  request,
  Sendmux::Core::Headers.idempotency_key("send-email-001")
)

puts response.data.message_id
```

### Client surface

`Sendmux::Sending::Client` exposes:

- `client.emails` for `sending_send_email` and `sending_send_email_batch`.
- `client.meta` for `sending_get_open_api_spec`.

Pass `base_url:` only when you are targeting an explicitly provided Sendmux endpoint for a controlled environment.

### Idempotency and retries

Mutating sending operations accept the `:idempotency_key` option. Use `Sendmux::Core::Headers.idempotency_key` so retries are safe when a request is replayable.

```ruby
client.emails.sending_send_email(
  request,
  Sendmux::Core::Headers.idempotency_key("send-email-002")
)
```

### Errors

Generated API errors are mapped to `Sendmux::Core::ApiError`.

```ruby
begin
  client.emails.sending_send_email(request)
rescue Sendmux::Core::ApiError => error
  warn "#{error.status} #{error.code}: #{error.message}"
end
```

## Support

- Documentation: https://docs.sendmux.ai
- Contact: contact@sendmux.ai

## Licence

MIT licence. See https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE.
