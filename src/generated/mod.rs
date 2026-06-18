//! OpenAPI provenance for the first-party Sendmux Rust SDK.
//!
//! This module is reserved for generated Rust output and source-of-truth
//! metadata. Hand-written client helpers live in `core`, `sending`, `mailbox`,
//! and `management`.

/// Committed OpenAPI snapshot used for the Sending surface.
pub const SENDING_OPENAPI_PATH: &str =
    "packages/python/mcp/sendmux_mcp/openapi/openapi-sending.json";

/// SHA-256 of `SENDING_OPENAPI_PATH` at the time this crate surface was added.
pub const SENDING_OPENAPI_SHA256: &str =
    "881f0693f0dd6d49d4c594e452cd67d9ba739d91aba7ff2f8e2cd899ca552e90";

/// Committed OpenAPI snapshot used for Mailbox and Management surfaces.
pub const APP_OPENAPI_PATH: &str = "packages/python/mcp/sendmux_mcp/openapi/openapi-app.json";

/// SHA-256 of `APP_OPENAPI_PATH` at the time this crate surface was added.
pub const APP_OPENAPI_SHA256: &str =
    "1b8a3916266edeb6b6512520733cecab17636a9909d2f0e707ef2e6ef46afbec";

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

/// Sending operations exposed by the source OpenAPI snapshot.
pub const SENDING_OPERATIONS: &[Operation] = &[
    Operation::new("sendingSendEmail", "POST", "/emails/send"),
    Operation::new("sendingSendEmailBatch", "POST", "/emails/send/batch"),
    Operation::new("sendingGetOpenApiSpec", "GET", "/openapi.json"),
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
