use sendmux::sending::{Attachment, BatchSendRequest, EmailSendRequest};
use sendmux::SendingClient;
use sendmux::{Error, MailboxClient, ManagementClient, RequestOptions};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

struct Server {
    address: SocketAddr,
    stopped: Arc<AtomicBool>,
    worker: Option<JoinHandle<Vec<String>>>,
}

impl Server {
    fn new(response: Value) -> Self {
        Self::responses(vec![(200, response)])
    }

    fn responses(responses: Vec<(u16, Value)>) -> Self {
        Self::wire_responses(
            responses
                .into_iter()
                .map(|(status, body)| (status, body.to_string()))
                .collect(),
        )
    }

    fn wire_responses(responses: Vec<(u16, String)>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let address = listener.local_addr().unwrap();
        eprintln!("fixture_pid={} listener={address}", std::process::id());
        let stopped = Arc::new(AtomicBool::new(false));
        let signal = stopped.clone();
        let worker = thread::spawn(move || {
            let mut requests = Vec::new();
            while !signal.load(Ordering::SeqCst) {
                let (mut stream, _) = match listener.accept() {
                    Ok(pair) => pair,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(2));
                        continue;
                    }
                    Err(error) => panic!("{error}"),
                };
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut request = Vec::new();
                while !request.ends_with(b"\r\n\r\n") {
                    let mut byte = [0];
                    stream.read_exact(&mut byte).unwrap();
                    request.push(byte[0]);
                }
                let headers = String::from_utf8(request.clone()).unwrap();
                let length = headers
                    .lines()
                    .find_map(|line| {
                        line.to_lowercase()
                            .strip_prefix("content-length: ")
                            .and_then(|value| value.parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                let mut body = vec![0; length];
                stream.read_exact(&mut body).unwrap();
                request.extend(body);
                requests.push(String::from_utf8(request).unwrap());
                let (status, response) = &responses[(requests.len() - 1).min(responses.len() - 1)];
                write!(stream, "HTTP/1.1 {status} Fixture\r\nContent-Type: application/json\r\nX-Request-ID: req_header\r\nRetry-After: 60\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", response.len(), response).unwrap();
            }
            requests
        });
        Self {
            address,
            stopped,
            worker: Some(worker),
        }
    }

    fn base(&self) -> String {
        format!("http://{}/api/v1", self.address)
    }

    fn finish(&mut self) -> Vec<String> {
        self.stopped.store(true, Ordering::SeqCst);
        let requests = self.worker.take().unwrap().join().unwrap();
        let rebound = TcpListener::bind(self.address).unwrap();
        drop(rebound);
        eprintln!("listener_closed={}", self.address);
        requests
    }
}

#[tokio::test]
async fn cursor_lists_preserve_pagination_and_advance_to_next_page() {
    let pages = (0..6).flat_map(|_| [
        (200, json!({"ok":true,"data":[{"id":"first"}],"meta":{"request_id":"req_first"},"pagination":{"has_more":true,"next_cursor":"next/a+b"}})),
        (200, json!({"ok":true,"data":[{"id":"second"}],"meta":{"request_id":"req_second"},"pagination":{"has_more":false}})),
    ]).collect();
    let mut server = Server::responses(pages);
    let mailbox = MailboxClient::new("smx_mbx_fixture")
        .unwrap()
        .with_base_url(server.base())
        .unwrap();
    let management = ManagementClient::new("smx_root_fixture")
        .unwrap()
        .with_base_url(server.base())
        .unwrap();
    macro_rules! advance {
        ($client:ident, $first:ident, $next:ident) => {{
            let first = $client.$first().await.unwrap();
            assert_eq!(first.data[0]["id"], "first");
            let page = first.pagination.unwrap();
            assert!(page.has_more);
            let second = $client.$next(page.next_cursor.as_deref()).await.unwrap();
            assert_eq!(second.data[0]["id"], "second");
            let last = second.pagination.unwrap();
            assert!(!last.has_more);
            assert_eq!(last.next_cursor, None);
        }};
    }
    advance!(mailbox, list_folders, list_folders_with_cursor);
    advance!(mailbox, list_messages, list_messages_with_cursor);
    advance!(management, list_domains, list_domains_with_cursor);
    advance!(management, list_mailboxes, list_mailboxes_with_cursor);
    advance!(management, list_webhooks, list_webhooks_with_cursor);
    advance!(
        management,
        list_sending_accounts,
        list_sending_accounts_with_cursor
    );
    let requests = server.finish();
    let routes = [
        "mailbox/folders",
        "mailbox/messages",
        "domains",
        "mailboxes",
        "webhooks",
        "providers",
    ];
    for (index, route) in routes.iter().enumerate() {
        assert!(requests[index * 2].starts_with(&format!("GET /api/v1/{route} HTTP/1.1\r\n")));
        assert!(requests[index * 2 + 1].starts_with(&format!(
            "GET /api/v1/{route}?cursor=next%2Fa%2Bb HTTP/1.1\r\n"
        )));
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        if self.worker.is_some() {
            self.finish();
        }
    }
}

#[tokio::test]
async fn sending_accepts_inline_and_uploaded_attachments_on_single_and_batch_routes() {
    let body = json!({
        "from":{"email":"sender@example.test"},"to":{"email":"recipient@example.test"},
        "subject":"Fixture","html_body":"<p>Fixture</p>",
        "attachments":[{"filename":"note.txt","content":"SGk=","encoding":"base64","type":"text/plain"},{"attachment_id":"att_abcdefghijklmnopqrstuvwx"}]
    });
    let request: EmailSendRequest = serde_json::from_value(body.clone())
        .expect("current attachment wire union must deserialize");
    assert_eq!(
        request.attachments[0],
        Attachment::base64("note.txt", "SGk=").with_content_type("text/plain")
    );
    let mut server = Server::responses(vec![
        (
            200,
            json!({"ok":true,"data":{"message_id":"msg_fixture","status":"queued"},"meta":{"request_id":"req_single"}}),
        ),
        (
            200,
            json!({"ok":true,"data":{"results":[{"index":0,"message_id":"msg_fixture","status":"queued"}],"summary":{"total":1,"queued":1,"failed":0}},"meta":{"request_id":"req_batch"}}),
        ),
    ]);
    let client = SendingClient::new("smx_mbx_fixture")
        .unwrap()
        .with_base_url(server.base())
        .unwrap();
    assert_eq!(
        client.send_email(&request).await.unwrap().data.message_id,
        "msg_fixture"
    );
    assert_eq!(
        client
            .send_email_batch(&BatchSendRequest::new(vec![request]))
            .await
            .unwrap()
            .data
            .summary
            .queued,
        1
    );
    let requests = server.finish();
    assert!(requests[0].starts_with("POST /api/v1/emails/send HTTP/1.1\r\n"));
    assert!(requests[1].starts_with("POST /api/v1/emails/send/batch HTTP/1.1\r\n"));
    let single: Value =
        serde_json::from_str(requests[0].split_once("\r\n\r\n").unwrap().1).unwrap();
    let batch: Value = serde_json::from_str(requests[1].split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(single, body);
    assert_eq!(batch, json!({"messages":[body]}));
    assert!(serde_json::from_value::<Attachment>(json!({"filename":"missing-content"})).is_err());
}

#[tokio::test]
async fn remaining_named_operations_bind_routes_inputs_and_outputs() {
    let data = json!({"team":{"id":"team_fixture","name":"Fixture"},"credential":{"id":"key_fixture","type":"api_key","name":null},"label":"Fixture","permissions":[],"mailboxes":[]});
    let mut server = Server::new(json!({"ok":true,"data":data,"meta":{"request_id":"req_named"}}));
    let mailbox = MailboxClient::new("smx_mbx_fixture")
        .unwrap()
        .with_base_url(server.base())
        .unwrap();
    let management = ManagementClient::new("smx_root_fixture")
        .unwrap()
        .with_base_url(server.base())
        .unwrap();
    let sending = SendingClient::new("smx_mbx_fixture")
        .unwrap()
        .with_base_url(server.base())
        .unwrap();
    assert_eq!(
        mailbox.get_connection().await.unwrap().data.team.id,
        "team_fixture"
    );
    assert_eq!(
        management.get_connection().await.unwrap().data.team.id,
        "team_fixture"
    );
    assert_eq!(
        sending.get_connection().await.unwrap().data.team.id,
        "team_fixture"
    );
    let send_body = json!({"to":[{"email":"recipient@example.test"}],"subject":"Fixture","text_body":"Harmless fixture"});
    let domain_body = json!({"domain":"fixture.example.test"});
    let mailbox_body = json!({"email":"fixture@example.test"});
    let responses = [
        mailbox.get_me().await.unwrap(),
        mailbox.get_message("message/a").await.unwrap(),
        mailbox.send_message(&send_body).await.unwrap(),
        management.get_domain("domain/a").await.unwrap(),
        management.get_mailbox("mailbox/a").await.unwrap(),
        management.billing_balance().await.unwrap(),
        management.create_domain(&domain_body).await.unwrap(),
        management.create_mailbox(&mailbox_body).await.unwrap(),
    ];
    for response in responses {
        assert_eq!(response.data, data);
        assert_eq!(response.request_id(), "req_named");
        assert_eq!(response.status.as_u16(), 200);
        assert_eq!(response.pagination, None);
    }
    let requests = server.finish();
    let routes = [
        "GET /mailbox/connection",
        "GET /me",
        "GET /me",
        "GET /mailbox/me",
        "GET /mailbox/messages/message%2Fa",
        "POST /mailbox/messages/send",
        "GET /domains/domain%2Fa",
        "GET /mailboxes/mailbox%2Fa",
        "GET /billing/balance",
        "POST /domains",
        "POST /mailboxes",
    ];
    assert_eq!(requests.len(), routes.len());
    for (request, route) in requests.iter().zip(routes) {
        let (method, path) = route.split_once(' ').unwrap();
        assert!(
            request.starts_with(&format!("{method} /api/v1{path} HTTP/1.1\r\n")),
            "incorrect named route: {route}"
        );
        assert!(request.contains("authorization: Bearer smx_"));
    }
    for (index, body) in [(5, send_body), (9, domain_body), (10, mailbox_body)] {
        assert_eq!(
            serde_json::from_str::<Value>(requests[index].split_once("\r\n\r\n").unwrap().1)
                .unwrap(),
            body
        );
    }
    let mut spec_server = Server::new(json!({"openapi":"3.1.0","paths":{}}));
    let spec = sending
        .with_base_url(spec_server.base())
        .unwrap()
        .openapi()
        .await
        .unwrap();
    assert_eq!(spec.data["openapi"], "3.1.0");
    assert_eq!(spec.pagination, None);
    assert!(spec_server.finish()[0].starts_with("GET /api/v1/openapi.json HTTP/1.1\r\n"));
}

#[tokio::test]
async fn public_options_and_error_mapping_preserve_single_attempt_semantics() {
    let body = json!({"ok":false,"error":{"code":"temporarily_unavailable","message":"Fixture unavailable","retryable":false},"meta":{"request_id":"req_error"}});
    let mut server = Server::responses(vec![
        (503, body.clone()),
        (
            409,
            json!({"ok":false,"error":{"code":"conflict","message":"Fixture conflict","retryable":true},"meta":{"request_id":"req_conflict"}}),
        ),
    ]);
    let client = ManagementClient::new("smx_root_fixture")
        .unwrap()
        .with_base_url(server.base())
        .unwrap();
    let options = RequestOptions::new()
        .idempotency_key("fixture-idempotency")
        .if_match("fixture-etag")
        .if_none_match("other-etag");
    let error = client
        .raw_post(
            "/domains",
            &json!({"domain":"fixture.example.test"}),
            &options,
        )
        .await
        .unwrap_err();
    match error {
        Error::Api(error) => {
            assert_eq!(error.status.as_u16(), 503);
            assert_eq!(error.code, "temporarily_unavailable");
            assert_eq!(error.message, "Fixture unavailable");
            assert!(!error.retryable);
            assert_eq!(error.request_id.as_deref(), Some("req_error"));
            assert_eq!(
                serde_json::from_str::<Value>(&error.raw_body).unwrap(),
                body
            );
        }
        other => panic!("expected API error, got {other}"),
    }
    assert!(
        matches!(client.raw_put("/domains/fixture", &json!({}), &options).await, Err(Error::Api(error)) if error.retryable && error.status.as_u16() == 409)
    );
    assert!(matches!(
        client
            .raw_post(
                "/domains",
                &json!({}),
                &RequestOptions::new().idempotency_key("bad\r\nvalue")
            )
            .await,
        Err(Error::InvalidHeaderValue(_))
    ));
    let requests = server.finish();
    assert_eq!(
        requests.len(),
        2,
        "errors must not retry and invalid headers must not send"
    );
    for request in requests {
        assert!(request.contains("idempotency-key: fixture-idempotency\r\n"));
        assert!(request.contains("if-match: fixture-etag\r\n"));
        assert!(request.contains("if-none-match: other-etag\r\n"));
    }
    assert!(matches!(
        ManagementClient::new("smx_mbx_fixture"),
        Err(Error::InvalidApiKeySurface { .. })
    ));
    assert!(matches!(
        MailboxClient::new("smx_root_fixture"),
        Err(Error::InvalidApiKeySurface { .. })
    ));
    assert!(matches!(
        SendingClient::new("smx_root_fixture"),
        Err(Error::InvalidApiKeySurface { .. })
    ));
    let mut fallback =
        Server::wire_responses(vec![(200, "not-json".into()), (429, "not-json".into())]);
    let client = client.with_base_url(fallback.base()).unwrap();
    assert!(matches!(
        client.raw_get("/domains").await,
        Err(Error::Decode(_))
    ));
    match client.raw_get("/domains").await.unwrap_err() {
        Error::Api(error) => {
            assert_eq!(error.code, "request_failed");
            assert_eq!(error.message, "Too Many Requests");
            assert_eq!(error.request_id.as_deref(), Some("req_header"));
            assert!(error.retryable);
            assert_eq!(error.raw_body, "not-json");
        }
        other => panic!("expected fallback API error, got {other}"),
    }
    assert_eq!(
        fallback.finish().len(),
        2,
        "Retry-After does not enable automatic retries"
    );
}

#[tokio::test]
async fn all_raw_methods_reject_cross_origin_paths_before_http() {
    let mut attacker =
        Server::new(json!({"ok":true,"data":{},"meta":{"request_id":"req_fixture"}}));
    let mailbox = MailboxClient::new("smx_mbx_fixture")
        .unwrap()
        .with_base_url("http://127.0.0.1:9/api/v1")
        .unwrap();
    let management = ManagementClient::new("smx_root_fixture")
        .unwrap()
        .with_base_url("http://127.0.0.1:9/api/v1")
        .unwrap();
    let path = format!("{}/capture", attacker.base());
    let body = json!({});
    let options = RequestOptions::default();
    let outcomes = vec![
        mailbox.raw_get(&path).await,
        mailbox.raw_post(&path, &body, &options).await,
        mailbox.raw_patch(&path, &body, &options).await,
        mailbox.raw_put(&path, &body, &options).await,
        mailbox.raw_delete(&path).await,
        management.raw_get(&path).await,
        management.raw_post(&path, &body, &options).await,
        management.raw_patch(&path, &body, &options).await,
        management.raw_put(&path, &body, &options).await,
        management.raw_delete(&path).await,
    ];
    let requests = attacker.finish();
    assert_eq!(
        requests.len(),
        0,
        "raw paths forwarded credentials across origins"
    );
    assert!(
        outcomes.iter().all(Result::is_err),
        "raw paths must reject before HTTP"
    );
    for result in outcomes {
        assert!(matches!(result, Err(Error::InvalidRequestPath)));
    }

    let mut configured = Server::new(
        json!({"ok":true,"data":{"configured":true},"meta":{"request_id":"req_fixture"}}),
    );
    let client = mailbox
        .with_base_url(configured.base())
        .unwrap()
        .with_http_client(
            reqwest::Client::builder()
                .timeout(Duration::from_secs(2))
                .build()
                .unwrap(),
        )
        .with_user_agent("public-contract-fixture")
        .unwrap();
    for path in [
        format!("{}/same-origin", configured.base()),
        format!("//{}/capture", configured.address),
        format!("\\\\{}/capture", configured.address),
    ] {
        assert!(matches!(
            client.raw_get(&path).await,
            Err(Error::InvalidRequestPath)
        ));
    }
    assert_eq!(
        client
            .raw_get("/mailbox/messages?cursor=a%2Fb")
            .await
            .unwrap()
            .data["configured"],
        true
    );
    let requests = configured.finish();
    assert_eq!(requests.len(), 1);
    assert!(requests[0].starts_with("GET /api/v1/mailbox/messages?cursor=a%2Fb HTTP/1.1\r\n"));
    assert!(requests[0].contains("user-agent: public-contract-fixture\r\n"));
}
