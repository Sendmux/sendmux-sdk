use crate::core::{ApiKeySurface, RequestOptions, Response, Result, Transport};
use reqwest::Client;
use serde::Serialize;

pub const DEFAULT_BASE_URL: &str = "https://app.sendmux.ai/api/v1";

/// Async Sendmux Management API client.
#[derive(Clone)]
pub struct ManagementClient {
    transport: Transport,
}

impl ManagementClient {
    pub fn new(api_key: impl Into<String>) -> Result<Self> {
        Ok(Self {
            transport: Transport::new(api_key, ApiKeySurface::Root, DEFAULT_BASE_URL)?,
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

    pub async fn list_domains(&self) -> Result<Response<serde_json::Value>> {
        self.raw_get("/domains").await
    }

    pub async fn get_domain(&self, public_id: &str) -> Result<Response<serde_json::Value>> {
        self.raw_get(&format!("/domains/{public_id}")).await
    }

    pub async fn list_mailboxes(&self) -> Result<Response<serde_json::Value>> {
        self.raw_get("/mailboxes").await
    }

    pub async fn get_mailbox(&self, public_id: &str) -> Result<Response<serde_json::Value>> {
        self.raw_get(&format!("/mailboxes/{public_id}")).await
    }

    pub async fn list_webhooks(&self) -> Result<Response<serde_json::Value>> {
        self.raw_get("/webhooks").await
    }

    pub async fn list_sending_accounts(&self) -> Result<Response<serde_json::Value>> {
        self.raw_get("/providers").await
    }

    pub async fn billing_balance(&self) -> Result<Response<serde_json::Value>> {
        self.raw_get("/billing/balance").await
    }

    pub async fn create_domain<B>(&self, body: &B) -> Result<Response<serde_json::Value>>
    where
        B: Serialize + ?Sized,
    {
        self.raw_post("/domains", body, &RequestOptions::default())
            .await
    }

    pub async fn create_mailbox<B>(&self, body: &B) -> Result<Response<serde_json::Value>>
    where
        B: Serialize + ?Sized,
    {
        self.raw_post("/mailboxes", body, &RequestOptions::default())
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
