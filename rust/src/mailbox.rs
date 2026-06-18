use crate::core::{
    encode_path_segment, ApiKeySurface, RequestOptions, Response, Result, Transport,
};
use reqwest::Client;
use serde::Serialize;

pub const DEFAULT_BASE_URL: &str = "https://app.sendmux.ai/api/v1";

/// Async Sendmux Mailbox API client.
#[derive(Clone)]
pub struct MailboxClient {
    transport: Transport,
}

impl MailboxClient {
    pub fn new(api_key: impl Into<String>) -> Result<Self> {
        Ok(Self {
            transport: Transport::new(api_key, ApiKeySurface::Mailbox, DEFAULT_BASE_URL)?,
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

    pub async fn get_me(&self) -> Result<Response<serde_json::Value>> {
        self.raw_get("/mailbox/me").await
    }

    pub async fn list_folders(&self) -> Result<Response<serde_json::Value>> {
        self.raw_get("/mailbox/folders").await
    }

    pub async fn list_messages(&self) -> Result<Response<serde_json::Value>> {
        self.raw_get("/mailbox/messages").await
    }

    pub async fn get_message(&self, message_id: &str) -> Result<Response<serde_json::Value>> {
        self.raw_get(&message_path(message_id)).await
    }

    pub async fn send_message<B>(&self, body: &B) -> Result<Response<serde_json::Value>>
    where
        B: Serialize + ?Sized,
    {
        self.raw_post("/mailbox/messages/send", body, &RequestOptions::default())
            .await
    }

    pub async fn raw_get(&self, path: &str) -> Result<Response<serde_json::Value>> {
        self.transport.get_json(path).await
    }

    pub async fn raw_post<B>(
        &self,
        path: &str,
        body: &B,
        options: &RequestOptions,
    ) -> Result<Response<serde_json::Value>>
    where
        B: Serialize + ?Sized,
    {
        self.transport.post_json(path, body, Some(options)).await
    }

    pub async fn raw_patch<B>(
        &self,
        path: &str,
        body: &B,
        options: &RequestOptions,
    ) -> Result<Response<serde_json::Value>>
    where
        B: Serialize + ?Sized,
    {
        self.transport.patch_json(path, body, Some(options)).await
    }

    pub async fn raw_put<B>(
        &self,
        path: &str,
        body: &B,
        options: &RequestOptions,
    ) -> Result<Response<serde_json::Value>>
    where
        B: Serialize + ?Sized,
    {
        self.transport.put_json(path, body, Some(options)).await
    }

    pub async fn raw_delete(&self, path: &str) -> Result<Response<serde_json::Value>> {
        self.transport.delete_json(path).await
    }
}

fn message_path(message_id: &str) -> String {
    format!("/mailbox/messages/{}", encode_path_segment(message_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_path_encodes_message_id_as_one_segment() {
        assert_eq!(
            message_path("folder/a?b=1"),
            "/mailbox/messages/folder%2Fa%3Fb%3D1"
        );
    }
}
