//! OpenAPI provenance for the first-party Sendmux Rust SDK.
//!
//! This module is reserved for generated Rust output and source-of-truth
//! metadata. Hand-written client helpers live in `core`, `sending`, `mailbox`,
//! and `management`.

/// Repository-relative OpenAPI snapshot path used for Sendmux provenance.
///
/// This path is relative to the `sendmux-sdk` monorepo, not to downstream
/// projects that install this crate from crates.io.
pub const SENDING_OPENAPI_PATH: &str =
    "packages/python/mcp/sendmux_mcp/openapi/openapi-sending.json";

/// SHA-256 of `SENDING_OPENAPI_PATH` at the time this crate surface was added.
pub const SENDING_OPENAPI_SHA256: &str =
    "f3caa5b45c7d9e0c8890d54964ffd7ed9a78073833b3d4959b40b714066d15e9";

/// Repository-relative OpenAPI snapshot path used for Sendmux provenance.
///
/// This path is relative to the `sendmux-sdk` monorepo, not to downstream
/// projects that install this crate from crates.io.
pub const APP_OPENAPI_PATH: &str = "packages/python/mcp/sendmux_mcp/openapi/openapi-app.json";

/// SHA-256 of `APP_OPENAPI_PATH` at the time this crate surface was added.
pub const APP_OPENAPI_SHA256: &str =
    "7807ce9239527497bfe35d62dd931096e46200027aa34e414920f86176ee2990";

/// Tags included from the Sending API snapshot.
pub const SENDING_TAGS: &[&str] = &["Emails", "Meta"];

/// Tags included from the app API snapshot for the Mailbox surface.
pub const MAILBOX_TAGS: &[&str] = &["Mailbox API"];

/// Tags included from the app API snapshot for the Management surface.
pub const MANAGEMENT_TAGS: &[&str] = &[
    "Billing",
    "Domain Filters",
    "Domains",
    "Emails",
    "Inboxes",
    "Mailbox Filters",
    "Mailboxes",
    "Sending accounts",
    "Webhooks",
];

/// Named sending operations represented by this curated client.
pub const SENDING_OPERATIONS: &[Operation] = &[
    Operation::new("sendingGetConnection", "GET", "/me"),
    Operation::new("sendingGetOpenApiSpec", "GET", "/openapi.json"),
    Operation::new("sendingSendEmail", "POST", "/emails/send"),
    Operation::new("sendingSendEmailBatch", "POST", "/emails/send/batch"),
];

/// Named mailbox operations represented by this curated client.
pub const MAILBOX_OPERATIONS: &[Operation] = &[
    Operation::new("mailboxGetConnection", "GET", "/mailbox/connection"),
    Operation::new("mailboxGetMe", "GET", "/mailbox/me"),
    Operation::new("mailboxGetMessage", "GET", "/mailbox/messages/{message_id}"),
    Operation::new("mailboxListFolders", "GET", "/mailbox/folders"),
    Operation::new("mailboxListMessages", "GET", "/mailbox/messages"),
    Operation::new("mailboxSendMessage", "POST", "/mailbox/messages/send"),
];

/// Named management operations represented by this curated client.
pub const MANAGEMENT_OPERATIONS: &[Operation] = &[
    Operation::new("managementCreateDomain", "POST", "/domains"),
    Operation::new("managementCreateMailbox", "POST", "/mailboxes"),
    Operation::new("managementGetConnection", "GET", "/me"),
    Operation::new("managementGetDomain", "GET", "/domains/{public_id}"),
    Operation::new("managementGetMailbox", "GET", "/mailboxes/{public_id}"),
    Operation::new("managementListBalance", "GET", "/billing/balance"),
    Operation::new("managementListDomains", "GET", "/domains"),
    Operation::new("managementListMailboxes", "GET", "/mailboxes"),
    Operation::new("managementListProviders", "GET", "/providers"),
    Operation::new("managementListWebhooks", "GET", "/webhooks"),
];

/// Minimal OpenAPI operation provenance.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Operation {
    pub operation_id: &'static str,
    pub method: &'static str,
    pub path: &'static str,
}

impl Operation {
    pub const fn new(operation_id: &'static str, method: &'static str, path: &'static str) -> Self {
        Self {
            operation_id,
            method,
            path,
        }
    }
}
