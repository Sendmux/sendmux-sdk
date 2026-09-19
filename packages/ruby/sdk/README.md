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
gem "sendmux-sdk", "~> 2.0"
```

## Migrate from 1.x to 2.0

`sendmux-sdk` 2.0 requires `sendmux-management >= 2.0.0, < 3.0` and
`sendmux-mailbox >= 2.0.0, < 3.0`, so it carries their two result-class changes;
`sendmux-sending` (now `>= 1.5.0, < 2.0`) and `sendmux-core` carry no breaking
change. The helper methods still return the surface gems' clients, so results
from `Sendmux::SDK.management(...)` and `Sendmux::SDK.mailbox(...)` follow
[the Management migration steps](../management/README.md#migrate-from-1x-to-20)
and [the Mailbox migration steps](../mailbox/README.md#migrate-from-1x-to-20).
If you check sending-account or thread-message result classes, read `variables`
from sending-account list entries, or build thread-message fixtures by hand,
update that code when upgrading to 2.0. Code that only reads other result
fields keeps working.

1. `management_list_providers` returns `ProviderListItem` entries instead of
   `ProviderItem`. List entries don't expose `variables`; detail results remain
   `ProviderItem` and require a variables hash, which is empty when none are
   set. Update list-specific class checks to use the class loaded by the
   umbrella entry point, and fetch the detail when you need an account's
   variables:

   ```ruby
   require "sendmux/sdk"

   def provider_list_item?(item)
     # Before: item.is_a?(Sendmux::Management::Generated::ProviderItem)
     item.is_a?(Sendmux::Management::Generated::ProviderListItem)
   end

   def provider_variables(management, public_id)
     detail = management.sending_accounts.management_get_provider(public_id).data
     detail.variables
   end
   ```

   Pass the client returned by `Sendmux::SDK.management(...)` as `management`
   and the account's `id` as `public_id`. Don't convert a list entry into
   `ProviderItem` or substitute an empty variables hash for the account's actual
   variables. Update hand-built detail fixtures to include `variables: {}` when
   no variables are set.

2. `mailbox_list_thread_messages` returns
   `MailboxThreadMessageSummaryCursorListResponse` instead of
   `MailboxMessageSummaryCursorListResponse`: its `meta` is
   `MailboxThreadMessagesMeta`, whose `thread_id` is required and whose
   `sync_state` is an optional string. Update thread-message class checks and
   add the thread identity to every thread-message result you construct:

   ```ruby
   def thread_message_list?(response)
     # Before: response.is_a?(Sendmux::Mailbox::Generated::MailboxMessageSummaryCursorListResponse)
     response.is_a?(Sendmux::Mailbox::Generated::MailboxThreadMessageSummaryCursorListResponse)
   end

   def thread_message_fixture(thread_id)
     # Before: meta: { request_id: "req_fixture" }
     Sendmux::Mailbox::Generated::MailboxThreadMessageSummaryCursorListResponse.build_from_hash(
       ok: true,
       meta: { request_id: "req_fixture", thread_id: thread_id },
       data: [],
       pagination: { has_more: false }
     )
   end
   ```

   Ordinary `mailbox_list_messages` results remain
   `MailboxMessageSummaryCursorListResponse` and have no thread identity. The
   other Mailbox list families replace the generic `ResponseMeta` with typed
   metadata whose `request_id` is unchanged and whose new fields are optional.

3. Run your application's tests with the updated bundle. Verify that list
   handling accepts `ProviderListItem` and only detail handling reads
   `variables`. A constructed thread-message result without `meta.thread_id`
   fails with `ArgumentError: thread_id cannot be nil`.

Update `sendmux-sdk`, `sendmux-mailbox`, `sendmux-management`, the bundle lock,
and affected call sites or fixtures together. To roll back, restore those gem
requirements, lock, and call-site changes together.

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

## Support

- Documentation: https://sendmux.ai/docs
- Contact: contact@sendmux.ai

## Licence

MIT licence. See https://github.com/Sendmux/sendmux-sdk/blob/main/LICENSE.
