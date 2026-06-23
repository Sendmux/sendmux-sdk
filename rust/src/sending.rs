use crate::core::{ApiKeySurface, RequestOptions, Response, Result, Transport};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const DEFAULT_BASE_URL: &str = "https://smtp.sendmux.ai/api/v1";

/// Async Sendmux Sending API client.
#[derive(Clone)]
pub struct SendingClient {
    transport: Transport,
}

impl SendingClient {
    pub fn new(api_key: impl Into<String>) -> Result<Self> {
        Ok(Self {
            transport: Transport::new(api_key, ApiKeySurface::Sending, DEFAULT_BASE_URL)?,
        })
    }

    pub fn with_base_url(mut self, base_url: impl AsRef<str>) -> Result<Self> {
        self.transport = self.transport.with_base_url(base_url)?;
        Ok(self)
    }

    pub fn with_http_client(mut self, client: Client) -> Self {
        self.transport = self.transport.with_http_client(client);
        self
    }

    pub fn with_user_agent(mut self, user_agent: impl AsRef<str>) -> Result<Self> {
        self.transport = self.transport.with_user_agent(user_agent)?;
        Ok(self)
    }

    pub async fn send_email(
        &self,
        request: &EmailSendRequest,
    ) -> Result<Response<SendSuccessData>> {
        self.send_email_with_options(request, &RequestOptions::default())
            .await
    }

    pub async fn send_email_with_options(
        &self,
        request: &EmailSendRequest,
        options: &RequestOptions,
    ) -> Result<Response<SendSuccessData>> {
        self.transport
            .post_json("/emails/send", request, Some(options))
            .await
    }

    pub async fn send_email_batch(
        &self,
        request: &BatchSendRequest,
    ) -> Result<Response<BatchSendSuccessData>> {
        self.send_email_batch_with_options(request, &RequestOptions::default())
            .await
    }

    pub async fn send_email_batch_with_options(
        &self,
        request: &BatchSendRequest,
        options: &RequestOptions,
    ) -> Result<Response<BatchSendSuccessData>> {
        self.transport
            .post_json("/emails/send/batch", request, Some(options))
            .await
    }

    pub async fn openapi(&self) -> Result<Response<serde_json::Value>> {
        self.transport.get_raw_json("/openapi.json").await
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Address {
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

impl Address {
    pub fn new(email: impl Into<String>) -> Self {
        Self {
            email: email.into(),
            name: None,
        }
    }

    pub fn with_name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }
}

pub type Recipient = Address;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Attachment {
    pub filename: String,
    pub content: String,
    #[serde(default = "default_attachment_encoding")]
    pub encoding: String,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

impl Attachment {
    pub fn base64(filename: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            filename: filename.into(),
            content: content.into(),
            encoding: default_attachment_encoding(),
            content_type: None,
        }
    }

    pub fn with_content_type(mut self, content_type: impl Into<String>) -> Self {
        self.content_type = Some(content_type.into());
        self
    }
}

fn default_attachment_encoding() -> String {
    "base64".to_owned()
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct EmailSendRequest {
    pub from: Address,
    pub to: Address,
    pub subject: String,
    pub html_body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_body: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cc: Vec<Recipient>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bcc: Vec<Recipient>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<Address>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_path: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<Attachment>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub custom_headers: BTreeMap<String, String>,
}

impl EmailSendRequest {
    pub fn new(
        from: Address,
        to: Address,
        subject: impl Into<String>,
        html_body: impl Into<String>,
    ) -> Self {
        Self {
            from,
            to,
            subject: subject.into(),
            html_body: html_body.into(),
            text_body: None,
            cc: Vec::new(),
            bcc: Vec::new(),
            reply_to: None,
            return_path: None,
            attachments: Vec::new(),
            custom_headers: BTreeMap::new(),
        }
    }

    pub fn text_body(mut self, value: impl Into<String>) -> Self {
        self.text_body = Some(value.into());
        self
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct BatchSendRequest {
    pub messages: Vec<EmailSendRequest>,
}

impl BatchSendRequest {
    pub fn new(messages: Vec<EmailSendRequest>) -> Self {
        Self { messages }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SendSuccessData {
    pub message_id: String,
    pub status: SendStatus,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct BatchSendSuccessData {
    pub results: Vec<BatchResultItem>,
    pub summary: BatchSummary,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct BatchResultItem {
    pub index: u32,
    pub message_id: Option<String>,
    pub status: BatchResultStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<crate::core::ErrorDetail>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct BatchSummary {
    pub total: u32,
    pub queued: u32,
    pub failed: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SendStatus {
    Queued,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchResultStatus {
    Queued,
    Failed,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_minimum_send_request() {
        let request = EmailSendRequest::new(
            Address::new("sender@example.com"),
            Address::new("user@example.com"),
            "Welcome",
            "<p>Hello</p>",
        );

        let value = serde_json::to_value(request).unwrap();

        assert_eq!(value["from"]["email"], "sender@example.com");
        assert_eq!(value["to"]["email"], "user@example.com");
        assert_eq!(value["subject"], "Welcome");
        assert!(value.get("cc").is_none());
    }
}
