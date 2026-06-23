# Sendmux Rust SDK

Official async Rust SDK for the Sendmux Sending, Mailbox, and Management APIs.

Sendmux provides programmable email sending, mailbox automation, and account
management APIs. The `sendmux` crate exposes first-party Rust clients for all
public Sendmux API surfaces. The Sending client includes typed request and
response models; Mailbox and Management expose typed surface clients with raw
JSON helpers while generated Rust model coverage expands:

- `sendmux::sending` for Sending API requests with send-capable `smx_mbx_*` keys or owner-approved Sending-resource `smx_agent_*` tokens.
- `sendmux::mailbox` for Mailbox API requests with `smx_mbx_*` keys or scoped `smx_agent_*` tokens.
- `sendmux::management` for Management API requests with `smx_root_*` keys.

## Install

```sh
cargo add sendmux
```

## Quick Start

```rust,no_run
use sendmux::sending::{Address, EmailSendRequest, SendingClient};

#[tokio::main]
async fn main() -> sendmux::Result<()> {
    let client = SendingClient::new(std::env::var("SENDMUX_MAILBOX_API_KEY").unwrap())?;

    let response = client
        .send_email(&EmailSendRequest::new(
            Address::new("sender@example.com").with_name("Example App"),
            Address::new("user@example.com"),
            "Welcome to Sendmux",
            "<p>Hello from Rust.</p>",
        ))
        .await?;

    println!("queued {} via {}", response.data.message_id, response.request_id());
    Ok(())
}
```

## Sending API

Use a send-capable `smx_mbx_` key or owner-approved Sending-resource `smx_agent_` token.

```rust,no_run
use sendmux::core::RequestOptions;
use sendmux::sending::{Address, BatchSendRequest, EmailSendRequest, SendingClient};

#[tokio::main]
async fn main() -> sendmux::Result<()> {
    let client = SendingClient::new(std::env::var("SENDMUX_MAILBOX_API_KEY").unwrap())?;

    let message = EmailSendRequest::new(
        Address::new("sender@example.com"),
        Address::new("user@example.com"),
        "Receipt",
        "<p>Your receipt is ready.</p>",
    )
    .text_body("Your receipt is ready.");

    let response = client
        .send_email_with_options(
            &message,
            &RequestOptions::new().idempotency_key("receipt-123"),
        )
        .await?;

    println!("{:?}", response.data.status);

    let batch = BatchSendRequest::new(vec![message]);
    let batch_response = client.send_email_batch(&batch).await?;
    println!("queued {}", batch_response.data.summary.queued);

    Ok(())
}
```

## Mailbox API

Use a mailbox-scoped `smx_mbx_` key or scoped `smx_agent_` token.

```rust,no_run
#[tokio::main]
async fn main() -> sendmux::Result<()> {
    let client = sendmux::mailbox(std::env::var("SENDMUX_MAILBOX_API_KEY").unwrap())?;

    let me = client.get_me().await?;
    println!("mailbox request id: {}", me.request_id());

    let messages = client.list_messages().await?;
    println!("{}", messages.data);

    Ok(())
}
```

## Management API

Use a root API key beginning with `smx_root_`.

```rust,no_run
#[tokio::main]
async fn main() -> sendmux::Result<()> {
    let client = sendmux::management(std::env::var("SENDMUX_ROOT_API_KEY").unwrap())?;

    let domains = client.list_domains().await?;
    println!("domains response: {}", domains.data);

    let balance = client.billing_balance().await?;
    println!("billing response: {}", balance.data);

    Ok(())
}
```

## API Keys

Do not hard-code API keys or commit them to source control.

- Sending clients accept send-capable keys with the `smx_mbx_` prefix or owner-approved Sending-resource `smx_agent_` tokens.
- Mailbox clients accept `smx_mbx_` keys or scoped `smx_agent_` tokens.
- Management clients require root keys with the `smx_root_` prefix.
- Store keys in your secret manager and pass them through environment variables
  or your runtime secret injection mechanism.

## Errors and Request IDs

SDK methods return `sendmux::Result<Response<T>>`. API failures are mapped to
`sendmux::Error::Api`, including status code, machine-readable code, retryable
flag, raw response body, and the Sendmux request ID when available.

```rust,no_run
#[tokio::main]
async fn main() -> sendmux::Result<()> {
    if let Err(sendmux::Error::Api(error)) =
        sendmux::sending("smx_mbx_example")?.openapi().await
    {
        eprintln!("{} {:?}", error.message, error.request_id);
    }

    Ok(())
}
```

## OpenAPI Source

This crate is aligned to the committed Sendmux OpenAPI snapshots in the
`sendmux-sdk` repository:

- Sending: `packages/python/mcp/sendmux_mcp/openapi/openapi-sending.json`
- Mailbox and Management: `packages/python/mcp/sendmux_mcp/openapi/openapi-app.json`

Generated/provenance metadata lives under `sendmux::generated`; hand-written
client helpers live under `sendmux::core`, `sendmux::sending`,
`sendmux::mailbox`, and `sendmux::management`.

## Links

- Product docs: <https://sendmux.ai/docs>
- Sending API: <https://sendmux.ai/docs/sending-api/introduction>
- Mailbox API: <https://sendmux.ai/docs/mailbox-api/introduction>
- Management API: <https://sendmux.ai/docs/api/introduction>
- GitHub: <https://github.com/Sendmux/sendmux-sdk>
- Support: <https://github.com/Sendmux/sendmux-sdk/issues>

## Publishing Safety

Publishing to crates.io is permanent for a version: published versions cannot be
overwritten, and code cannot be deleted. Run `cargo publish --dry-run` and
inspect `target/package` before any real publish.
