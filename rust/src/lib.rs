#![doc = include_str!("../README.crates.io.md")]

pub mod core;
pub mod generated;
pub mod mailbox;
pub mod management;
pub mod sending;

pub use crate::core::{
    validate_api_key, ApiError, ApiKeySurface, Error, ErrorDetail, ErrorIssue, RequestOptions,
    Response, ResponseMeta, Result,
};
pub use crate::mailbox::MailboxClient;
pub use crate::management::ManagementClient;
pub use crate::sending::SendingClient;

/// Creates a Sending API client with a mailbox-scoped `smx_mbx_*` API key.
pub fn sending(api_key: impl Into<String>) -> Result<SendingClient> {
    SendingClient::new(api_key)
}

/// Creates a Mailbox API client with a mailbox-scoped `smx_mbx_*` API key.
pub fn mailbox(api_key: impl Into<String>) -> Result<MailboxClient> {
    MailboxClient::new(api_key)
}

/// Creates a Management API client with a root `smx_root_*` API key.
pub fn management(api_key: impl Into<String>) -> Result<ManagementClient> {
    ManagementClient::new(api_key)
}
