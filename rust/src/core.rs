use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, IF_MATCH, IF_NONE_MATCH, USER_AGENT};
use reqwest::{Client, Method, StatusCode};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use thiserror::Error;
use url::Url;

pub type Result<T> = std::result::Result<T, Error>;

/// Sendmux API key category accepted by a surface.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApiKeySurface {
    /// Root/team API keys with the `smx_root_` prefix.
    Root,
    /// Mailbox-scoped API keys or agent tokens with `smx_mbx_` or `smx_agent_` prefixes.
    Mailbox,
    /// Send-capable API keys or owner-approved agent tokens with `smx_mbx_` or `smx_agent_` prefixes.
    Sending,
}

impl fmt::Display for ApiKeySurface {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ApiKeySurface::Root => f.write_str("root"),
            ApiKeySurface::Mailbox => f.write_str("mailbox"),
            ApiKeySurface::Sending => f.write_str("sending"),
        }
    }
}

/// Validates a Sendmux API key prefix without exposing the key value.
pub fn validate_api_key(api_key: &str, surface: ApiKeySurface) -> Result<()> {
    match surface {
        _ if api_key.is_empty() => Err(Error::MissingApiKey),
        _ if api_key.contains(['\r', '\n']) => Err(Error::InvalidApiKey),
        ApiKeySurface::Root if !api_key.starts_with("smx_root_") => {
            Err(Error::InvalidApiKeySurface {
                expected: ApiKeySurface::Root,
            })
        }
        ApiKeySurface::Mailbox if !api_key.starts_with("smx_mbx_") => {
            if api_key.starts_with("smx_agent_") {
                return Ok(());
            }

            Err(Error::InvalidApiKeySurface {
                expected: ApiKeySurface::Mailbox,
            })
        }
        ApiKeySurface::Sending
            if !api_key.starts_with("smx_mbx_") && !api_key.starts_with("smx_agent_") =>
        {
            Err(Error::InvalidApiKeySurface {
                expected: ApiKeySurface::Sending,
            })
        }
        _ => Ok(()),
    }
}

fn validate_access_token(token: &str) -> Result<()> {
    let value = token.trim_end_matches('=');
    if value.is_empty()
        || !value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'+' | b'/')
        })
    {
        return Err(Error::InvalidAccessToken);
    }
    Ok(())
}

/// HTTP response wrapper returned by SDK operations.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Response<T> {
    pub data: T,
    pub meta: ResponseMeta,
    pub status: StatusCode,
    pub pagination: Option<CursorPagination>,
}

/// Cursor metadata returned by list operations.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CursorPagination {
    pub has_more: bool,
    pub next_cursor: Option<String>,
}

impl<T> Response<T> {
    pub fn request_id(&self) -> &str {
        &self.meta.request_id
    }
}

/// Sendmux response metadata.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ResponseMeta {
    pub request_id: String,
}

/// Current credential context returned by a connection check.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Connection {
    pub team: ConnectionTeam,
    pub credential: ConnectionCredential,
    pub label: String,
    pub permissions: Vec<String>,
    pub mailboxes: Vec<ConnectionMailbox>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ConnectionTeam {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ConnectionCredential {
    pub id: String,
    #[serde(rename = "type")]
    pub credential_type: CredentialType,
    pub name: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialType {
    ApiKey,
    Oauth,
    AgentToken,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ConnectionMailbox {
    pub id: String,
    pub email: String,
}

/// Optional request headers shared across surfaces.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct RequestOptions {
    pub idempotency_key: Option<String>,
    pub if_match: Option<String>,
    pub if_none_match: Option<String>,
}

impl RequestOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn idempotency_key(mut self, value: impl Into<String>) -> Self {
        self.idempotency_key = Some(value.into());
        self
    }

    pub fn if_match(mut self, value: impl Into<String>) -> Self {
        self.if_match = Some(value.into());
        self
    }

    pub fn if_none_match(mut self, value: impl Into<String>) -> Self {
        self.if_none_match = Some(value.into());
        self
    }
}

/// Error type returned by the Sendmux Rust SDK.
#[derive(Debug, Error)]
pub enum Error {
    #[error("sendmux: api key is required")]
    MissingApiKey,
    #[error("sendmux: api key must not contain control newlines")]
    InvalidApiKey,
    #[error("sendmux: {expected} API key has the wrong prefix")]
    InvalidApiKeySurface { expected: ApiKeySurface },
    #[error("sendmux: a valid bare access token is required")]
    InvalidAccessToken,
    #[error("sendmux: invalid base URL")]
    InvalidBaseUrl(#[from] url::ParseError),
    #[error("sendmux: base URL cannot be used for path segments")]
    CannotBeBaseUrl,
    #[error("sendmux: request path must be relative to the configured origin")]
    InvalidRequestPath,
    #[error("sendmux: invalid header value")]
    InvalidHeaderValue(#[from] reqwest::header::InvalidHeaderValue),
    #[error("{0}")]
    Api(Box<ApiError>),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Decode(#[from] serde_json::Error),
}

/// Structured Sendmux API error response.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: String,
    pub message: String,
    pub retryable: bool,
    pub request_id: Option<String>,
    pub detail: Option<ErrorDetail>,
    pub raw_body: String,
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.request_id {
            Some(request_id) => write!(
                f,
                "sendmux API error {} {}: {} (request_id: {})",
                self.status.as_u16(),
                self.code,
                self.message,
                request_id
            ),
            None => write!(
                f,
                "sendmux API error {} {}: {}",
                self.status.as_u16(),
                self.code,
                self.message
            ),
        }
    }
}

/// API error detail returned by Sendmux.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ErrorDetail {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub retryable: Option<bool>,
    #[serde(default)]
    pub param: Option<String>,
    #[serde(default)]
    pub doc_url: Option<String>,
    #[serde(default)]
    pub errors: Vec<ErrorIssue>,
}

/// Per-field validation issue returned inside an API error.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ErrorIssue {
    pub field: String,
    pub code: String,
    pub message: String,
}

#[derive(Clone)]
enum Credential {
    Static(String),
    Provider(Arc<dyn Fn() -> TokenFuture + Send + Sync>),
}

type TokenFuture = Pin<Box<dyn Future<Output = Result<String>> + Send>>;

#[derive(Clone)]
pub(crate) struct Transport {
    client: Client,
    base_url: Url,
    credential: Credential,
    user_agent: HeaderValue,
}

impl Transport {
    pub(crate) fn new(
        api_key: impl Into<String>,
        surface: ApiKeySurface,
        base_url: &str,
    ) -> Result<Self> {
        let api_key = api_key.into();
        validate_api_key(&api_key, surface)?;
        Self::with_credential(Credential::Static(api_key), base_url)
    }

    pub(crate) fn new_with_access_token(token: impl Into<String>, base_url: &str) -> Result<Self> {
        let token = token.into();
        validate_access_token(&token)?;
        Self::with_credential(Credential::Static(token), base_url)
    }

    pub(crate) fn new_with_token_provider<F, Fut>(provider: F, base_url: &str) -> Result<Self>
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<String>> + Send + 'static,
    {
        Self::with_credential(
            Credential::Provider(Arc::new(move || Box::pin(provider()))),
            base_url,
        )
    }

    fn with_credential(credential: Credential, base_url: &str) -> Result<Self> {
        Ok(Self {
            client: Client::new(),
            base_url: normalize_base_url(base_url)?,
            credential,
            user_agent: HeaderValue::from_static(concat!(
                "sendmux-rust/",
                env!("CARGO_PKG_VERSION")
            )),
        })
    }

    pub(crate) fn with_base_url(mut self, base_url: impl AsRef<str>) -> Result<Self> {
        self.base_url = normalize_base_url(base_url.as_ref())?;
        Ok(self)
    }

    pub(crate) fn with_http_client(mut self, client: Client) -> Self {
        self.client = client;
        self
    }

    pub(crate) fn with_user_agent(mut self, user_agent: impl AsRef<str>) -> Result<Self> {
        self.user_agent = HeaderValue::from_str(user_agent.as_ref())?;
        Ok(self)
    }

    pub(crate) async fn get_json<T>(&self, path: &str) -> Result<Response<T>>
    where
        T: DeserializeOwned,
    {
        self.request_json::<(), T>(Method::GET, path, None, None)
            .await
    }

    pub(crate) async fn get_raw_json<T>(&self, path: &str) -> Result<Response<T>>
    where
        T: DeserializeOwned,
    {
        self.request_raw_json::<(), T>(Method::GET, path, None, None)
            .await
    }

    pub(crate) async fn get_page<T>(&self, path: &str, cursor: Option<&str>) -> Result<Response<T>>
    where
        T: DeserializeOwned,
    {
        let path = match cursor {
            Some(cursor) => format!(
                "{path}?{}",
                url::form_urlencoded::Serializer::new(String::new())
                    .append_pair("cursor", cursor)
                    .finish()
            ),
            None => path.to_owned(),
        };
        self.get_json(&path).await
    }

    pub(crate) async fn delete_json<T>(&self, path: &str) -> Result<Response<T>>
    where
        T: DeserializeOwned,
    {
        self.request_json::<(), T>(Method::DELETE, path, None, None)
            .await
    }

    pub(crate) async fn post_json<B, T>(
        &self,
        path: &str,
        body: &B,
        options: Option<&RequestOptions>,
    ) -> Result<Response<T>>
    where
        B: Serialize + ?Sized,
        T: DeserializeOwned,
    {
        self.request_json(Method::POST, path, Some(body), options)
            .await
    }

    pub(crate) async fn patch_json<B, T>(
        &self,
        path: &str,
        body: &B,
        options: Option<&RequestOptions>,
    ) -> Result<Response<T>>
    where
        B: Serialize + ?Sized,
        T: DeserializeOwned,
    {
        self.request_json(Method::PATCH, path, Some(body), options)
            .await
    }

    pub(crate) async fn put_json<B, T>(
        &self,
        path: &str,
        body: &B,
        options: Option<&RequestOptions>,
    ) -> Result<Response<T>>
    where
        B: Serialize + ?Sized,
        T: DeserializeOwned,
    {
        self.request_json(Method::PUT, path, Some(body), options)
            .await
    }

    async fn request_json<B, T>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
        options: Option<&RequestOptions>,
    ) -> Result<Response<T>>
    where
        B: Serialize + ?Sized,
        T: DeserializeOwned,
    {
        let (status, headers, bytes) = self.send_json_request(method, path, body, options).await?;
        decode_enveloped_response(status, &headers, &bytes)
    }

    async fn request_raw_json<B, T>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
        options: Option<&RequestOptions>,
    ) -> Result<Response<T>>
    where
        B: Serialize + ?Sized,
        T: DeserializeOwned,
    {
        let (status, headers, bytes) = self.send_json_request(method, path, body, options).await?;
        decode_raw_response(status, &headers, &bytes)
    }

    async fn send_json_request<B>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
        options: Option<&RequestOptions>,
    ) -> Result<(StatusCode, HeaderMap, Vec<u8>)>
    where
        B: Serialize + ?Sized,
    {
        let mut request = self
            .client
            .request(method, self.url(path)?)
            .headers(self.default_headers().await?);

        if let Some(options) = options {
            request = apply_options(request, options)?;
        }

        if let Some(body) = body {
            request = request.json(body);
        }

        let response = request.send().await?;
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = response.bytes().await?;

        if !status.is_success() {
            return Err(Error::Api(Box::new(map_api_error(
                status, &headers, &bytes,
            ))));
        }

        Ok((status, headers, bytes.to_vec()))
    }

    async fn default_headers(&self) -> Result<HeaderMap> {
        let token = match &self.credential {
            Credential::Static(token) => token.clone(),
            Credential::Provider(provider) => {
                let token = provider().await?;
                validate_access_token(&token)?;
                token
            }
        };
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, self.user_agent.clone());
        let mut authorization = HeaderValue::from_str(&format!("Bearer {token}"))?;
        authorization.set_sensitive(true);
        headers.insert(AUTHORIZATION, authorization);
        Ok(headers)
    }

    fn url(&self, path: &str) -> Result<Url> {
        if Url::parse(path).is_ok() || path.starts_with("//") || path.contains('\\') {
            return Err(Error::InvalidRequestPath);
        }
        let url = self.base_url.join(path.trim_start_matches('/'))?;
        if url.origin() != self.base_url.origin() {
            return Err(Error::InvalidRequestPath);
        }
        Ok(url)
    }
}

pub(crate) fn encode_path_segment(segment: &str) -> String {
    utf8_percent_encode(segment, NON_ALPHANUMERIC).to_string()
}

fn normalize_base_url(value: &str) -> Result<Url> {
    let mut trimmed = value.trim_end_matches('/').to_owned();
    trimmed.push('/');
    let url = Url::parse(&trimmed)?;
    if url.cannot_be_a_base() {
        return Err(Error::CannotBeBaseUrl);
    }
    Ok(url)
}

fn apply_options(
    mut request: reqwest::RequestBuilder,
    options: &RequestOptions,
) -> Result<reqwest::RequestBuilder> {
    if let Some(value) = &options.idempotency_key {
        request = request.header("Idempotency-Key", HeaderValue::from_str(value)?);
    }
    if let Some(value) = &options.if_match {
        request = request.header(IF_MATCH, HeaderValue::from_str(value)?);
    }
    if let Some(value) = &options.if_none_match {
        request = request.header(IF_NONE_MATCH, HeaderValue::from_str(value)?);
    }
    Ok(request)
}

#[derive(Debug, Deserialize)]
struct SuccessEnvelope<T> {
    data: T,
    meta: ResponseMeta,
    pagination: Option<CursorPagination>,
}

fn decode_enveloped_response<T>(
    status: StatusCode,
    _headers: &HeaderMap,
    bytes: &[u8],
) -> Result<Response<T>>
where
    T: DeserializeOwned,
{
    let envelope: SuccessEnvelope<T> = serde_json::from_slice(bytes)?;
    Ok(Response {
        data: envelope.data,
        meta: envelope.meta,
        status,
        pagination: envelope.pagination,
    })
}

fn decode_raw_response<T>(
    status: StatusCode,
    headers: &HeaderMap,
    bytes: &[u8],
) -> Result<Response<T>>
where
    T: DeserializeOwned,
{
    Ok(Response {
        data: serde_json::from_slice(bytes)?,
        meta: ResponseMeta {
            request_id: header_value(headers, "x-request-id").unwrap_or_default(),
        },
        status,
        pagination: None,
    })
}

#[derive(Debug, Deserialize)]
struct ErrorEnvelope {
    error: ErrorDetail,
    meta: Option<ResponseMeta>,
}

fn map_api_error(status: StatusCode, headers: &HeaderMap, bytes: &[u8]) -> ApiError {
    let raw_body = String::from_utf8_lossy(bytes).into_owned();
    let parsed = serde_json::from_slice::<ErrorEnvelope>(bytes).ok();
    let detail = parsed.as_ref().map(|body| body.error.clone());
    let request_id = parsed
        .and_then(|body| body.meta.map(|meta| meta.request_id))
        .or_else(|| header_value(headers, "x-request-id"));
    let retryable = detail
        .as_ref()
        .and_then(|error| error.retryable)
        .unwrap_or(status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error());
    let code = detail
        .as_ref()
        .map(|error| error.code.clone())
        .unwrap_or_else(|| "request_failed".to_owned());
    let message = detail
        .as_ref()
        .map(|error| error.message.clone())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            status
                .canonical_reason()
                .unwrap_or("Sendmux API request failed")
                .to_owned()
        });

    ApiError {
        status,
        code,
        message,
        retryable,
        request_id,
        detail,
        raw_body,
    }
}

fn header_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_expected_api_key_prefixes() {
        assert!(validate_api_key("smx_mbx_test", ApiKeySurface::Mailbox).is_ok());
        assert!(validate_api_key("smx_agent_test", ApiKeySurface::Mailbox).is_ok());
        assert!(validate_api_key("smx_mbx_test", ApiKeySurface::Sending).is_ok());
        assert!(validate_api_key("smx_agent_test", ApiKeySurface::Sending).is_ok());
        assert!(validate_api_key("smx_root_test", ApiKeySurface::Root).is_ok());
        assert!(matches!(
            validate_api_key("smx_mbx_test", ApiKeySurface::Root),
            Err(Error::InvalidApiKeySurface {
                expected: ApiKeySurface::Root
            })
        ));
        assert!(matches!(
            validate_api_key("smx_root_test", ApiKeySurface::Sending),
            Err(Error::InvalidApiKeySurface {
                expected: ApiKeySurface::Sending
            })
        ));
        assert!(matches!(
            validate_api_key("smx_mbx_test\n", ApiKeySurface::Mailbox),
            Err(Error::InvalidApiKey)
        ));
    }

    #[test]
    fn maps_api_error_body_and_request_id() {
        let status = StatusCode::BAD_REQUEST;
        let body = br#"{"ok":false,"error":{"code":"validation_error","message":"Invalid recipient","retryable":false},"meta":{"request_id":"req_test"}}"#;
        let error = map_api_error(status, &HeaderMap::new(), body);

        assert_eq!(error.status, StatusCode::BAD_REQUEST);
        assert_eq!(error.code, "validation_error");
        assert_eq!(error.message, "Invalid recipient");
        assert!(!error.retryable);
        assert_eq!(error.request_id.as_deref(), Some("req_test"));
    }

    #[test]
    fn falls_back_to_header_request_id_and_retryable_status() {
        let mut headers = HeaderMap::new();
        headers.insert("x-request-id", HeaderValue::from_static("req_header"));

        let error = map_api_error(StatusCode::TOO_MANY_REQUESTS, &headers, b"rate limited");

        assert_eq!(error.code, "request_failed");
        assert!(error.retryable);
        assert_eq!(error.request_id.as_deref(), Some("req_header"));
    }

    #[test]
    fn encodes_dynamic_path_segments() {
        assert_eq!(encode_path_segment("folder/a?b=1"), "folder%2Fa%3Fb%3D1");
        assert_eq!(encode_path_segment(".."), "%2E%2E");
    }

    #[test]
    fn decodes_raw_json_response_without_success_envelope() {
        let mut headers = HeaderMap::new();
        headers.insert("x-request-id", HeaderValue::from_static("req_raw"));
        let response: Response<serde_json::Value> =
            decode_raw_response(StatusCode::OK, &headers, br#"{"openapi":"3.1.0"}"#).unwrap();

        assert_eq!(response.data["openapi"], "3.1.0");
        assert_eq!(response.request_id(), "req_raw");
    }
}
