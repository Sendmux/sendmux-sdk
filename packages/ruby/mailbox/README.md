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

For OAuth, use a REST access token with the scopes and mailbox access required by the operation. See [OAuth for REST APIs](https://sendmux.ai/docs/developer-tools/oauth).

## Installation

```sh
gem install sendmux-mailbox
```

Or add it to your Gemfile:

```ruby
gem "sendmux-mailbox", "~> 2.0"
```

## Migrate from 1.x to 2.0

If you check thread-message result classes or build thread-message fixtures by
hand, update them when upgrading to 2.0. `mailbox_list_thread_messages` returns
`MailboxThreadMessageSummaryCursorListResponse` instead of
`MailboxMessageSummaryCursorListResponse`: its `meta` is
`MailboxThreadMessagesMeta`, whose `thread_id` is required and whose
`sync_state` is an optional string. Code that only reads thread-message results
keeps working.

1. Update thread-message class checks to use the class loaded by the public
   entry point:

   ```ruby
   require "sendmux/mailbox"

   def thread_message_list?(response)
     # Before: response.is_a?(Sendmux::Mailbox::Generated::MailboxMessageSummaryCursorListResponse)
     response.is_a?(Sendmux::Mailbox::Generated::MailboxThreadMessageSummaryCursorListResponse)
   end
   ```

2. Add the thread identity to every thread-message result you construct. Pass
   the thread's `id` as the `thread_id` argument when you read one from the
   public client:

   ```ruby
   def thread_message_fixture(thread_id)
     # Before: meta: { request_id: "req_fixture" }
     Sendmux::Mailbox::Generated::MailboxThreadMessageSummaryCursorListResponse.build_from_hash(
       ok: true,
       meta: { request_id: "req_fixture", thread_id: thread_id },
       data: [],
       pagination: { has_more: false }
     )
   end

   def thread_sync_state(client, thread_id)
     response = client.mailbox_api.mailbox_list_thread_messages(thread_id, limit: 50)
     [response.meta.thread_id, response.meta.sync_state]
   end
   ```

   Ordinary `mailbox_list_messages` results remain
   `MailboxMessageSummaryCursorListResponse`: they have no thread identity and
   expose an optional typed `meta.sync_state`. Identity, submission, quota, and
   thread list responses likewise replace the generic `ResponseMeta` with
   `MailboxIdentityListMeta` or `MailboxQueryMeta`, which add optional
   `identity_state` or `query_state`; `meta.request_id` is unchanged everywhere
   and no new field is required there.

3. Run your application's tests with the updated bundle. A constructed
   thread-message result without `meta.thread_id` fails with
   `ArgumentError: thread_id cannot be nil`.

Update `sendmux-mailbox`, the bundle lock, and affected call sites or fixtures
together. To roll back, restore those gem requirement, lock, and call-site
changes together.

## OAuth access tokens

Pass either `api_key:` or `access_token:`. `access_token:` accepts a bare token string or a callable; the callable is evaluated once per authenticated request. Your application owns token storage, expiry checks and refresh coordination.

```ruby
require "sendmux/mailbox"

client = Sendmux::Mailbox::Client.new(
  access_token: -> { ENV.fetch("SENDMUX_ACCESS_TOKEN") }
)
```

## Usage

Create a mailbox client with a mailbox key or scoped agent token for the API-key example below.

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

### Attachments and events

Message and event attachment metadata includes `download_url`, a short-lived presigned URL for that single attachment. Fetch it promptly with a plain HTTP client and no `Authorization` header. If it expires, re-fetch the message or attachment metadata to receive a fresh URL.

Use `mailbox_upload_attachment` to upload bytes and pass the returned `blob_id` into `mailbox_send_message` attachments. Inline base64 attachments remain available in the generated send body shape for small payloads.

`mailbox_stream_events` exposes the Mailbox SSE endpoint for clients that want live `message.received` events.

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
